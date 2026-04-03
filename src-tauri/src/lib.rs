use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

const API_PORT: u16 = 17321;
const TOOLBAR_HEIGHT: f64 = 48.0;
const APP_BUNDLE_ID: &str = "com.objsinc.shizuku";
const PROJECT_ROOT: &str = "/Users/objsinc-macair-00/embitious/shizuku-project/shizuku-app";

#[derive(Serialize, Deserialize, Clone)]
struct SimContext {
    sim_screenshot: Option<String>,
    view: Option<String>,
    files: Vec<String>,
}

fn get_sim_context() -> SimContext {
    // 1. Take simulator screenshot
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let sim_path = format!("/private/tmp/sim-screenshot-{}.png", timestamp);

    let sim_screenshot = Command::new("xcrun")
        .args(["simctl", "io", "booted", "screenshot", &sim_path])
        .output()
        .ok()
        .and_then(|o| if o.status.success() { Some(sim_path) } else { None });

    // 2. Read current view from app container
    let container = Command::new("xcrun")
        .args(["simctl", "get_app_container", "booted", APP_BUNDLE_ID, "data"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

    let current_view = container.and_then(|c| {
        let view_file = format!("{}/Documents/current_view.txt", c);
        std::fs::read_to_string(view_file).ok().map(|s| s.trim().to_string())
    });

    // 3. Map view to source files
    let mut files = Vec::new();
    if let Some(ref view) = current_view {
        let (dirs, vms): (Vec<&str>, Vec<&str>) = match view.as_str() {
            "explore" => (
                vec!["Views/Explore", "Views/Canvas", "Views/Materials", "Views/Queue", "Views/Recorder"],
                vec![
                    "ExploreViewModel", "ConversationViewModel", "MessagingViewModel",
                    "MaterialsViewModel", "QueueViewModel", "RecorderViewModel",
                    "DescribeImageViewModel", "CanvasViewModel",
                ],
            ),
            "study" => (
                vec!["Views/Study", "Views/Practice", "Views/Typing"],
                vec![
                    "SessionViewModel", "SelectionViewModel", "PracticeViewModel",
                    "TypingViewModel", "StudyListViewModel",
                ],
            ),
            "studylist" => (
                vec!["Views/StudyList"],
                vec!["StudyListViewModel", "TypingViewModel"],
            ),
            "profile" => (
                vec!["Views/Profile", "Views/Settings"],
                vec!["ProfileViewModel", "SettingsViewModel"],
            ),
            _ => (vec![], vec![]),
        };

        let src = format!("{}/Sources/ShizukuApp", PROJECT_ROOT);
        for d in &dirs {
            let dir_path = format!("{}/{}", src, d);
            if let Ok(entries) = std::fs::read_dir(&dir_path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("swift") {
                        let rel = p.to_string_lossy().replace(&format!("{}/", PROJECT_ROOT), "");
                        files.push(rel);
                    }
                }
            }
        }
        for vm in &vms {
            files.push(format!("Sources/ShizukuApp/ViewModels/{}.swift", vm));
        }
    }

    SimContext {
        sim_screenshot,
        view: current_view,
        files,
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct ScreenshotResult {
    path: String,
    sim: SimContext,
}

struct MultiFrameStore {
    results: Mutex<Vec<ScreenshotResult>>,
}

fn get_window_geometry(handle: &tauri::AppHandle) -> Result<(i32, i32, u32, u32), String> {
    let window = handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    // Convert physical pixels to logical points for screencapture
    let x = (pos.x as f64 / scale) as i32;
    let y = ((pos.y as f64 / scale) + TOOLBAR_HEIGHT) as i32;
    let w = (size.width as f64 / scale) as u32;
    let h = ((size.height as f64 / scale) - TOOLBAR_HEIGHT) as u32;

    Ok((x, y, w, h))
}

fn do_screenshot(handle: &tauri::AppHandle, custom_path: Option<String>, frame_rect: Option<(f64, f64, f64, f64)>) -> Result<String, String> {
    let (x, y, w, h) = match frame_rect {
        Some((fx, fy, fw, fh)) => {
            let window = handle.get_webview_window("main").ok_or("Window not found")?;
            let pos = window.outer_position().map_err(|e| e.to_string())?;
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            let win_x = pos.x as f64 / scale;
            let win_y = pos.y as f64 / scale;
            ((win_x + fx) as i32, (win_y + fy) as i32, fw as u32, fh as u32)
        }
        None => get_window_geometry(handle)?,
    };

    let path = match custom_path {
        Some(p) => p,
        None => {
            let home = std::env::var("HOME").map_err(|e| e.to_string())?;
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs();
            format!("{}/Desktop/fudo-{}.png", home, ts)
        }
    };

    let region = format!("{},{},{},{}", x, y, w, h);
    let output = Command::new("screencapture")
        .args(["-R", &region, &path])
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("screencapture failed (exit {}): {}", output.status, stderr));
    }

    // screencapture can exit 0 but produce no file when Screen Recording permission is missing
    if !std::path::Path::new(&path).exists() {
        return Err(
            "Screenshot file not created. Grant Screen Recording permission to Fudo in System Settings > Privacy & Security > Screen Recording, then relaunch."
                .to_string(),
        );
    }

    Ok(path)
}

#[tauri::command]
fn take_screenshot(app: tauri::AppHandle, path: Option<String>, frame_rect: Option<(f64, f64, f64, f64)>) -> Result<ScreenshotResult, String> {
    let screenshot_path = do_screenshot(&app, path, frame_rect)?;
    let sim = get_sim_context();
    Ok(ScreenshotResult {
        path: screenshot_path,
        sim,
    })
}

#[tauri::command]
fn store_multi_frame_results(
    state: tauri::State<'_, MultiFrameStore>,
    results: Vec<ScreenshotResult>,
) -> Result<(), String> {
    let mut store = state.results.lock().map_err(|e| e.to_string())?;
    *store = results;
    Ok(())
}

fn percent_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &input[i + 1..i + 3],
                16,
            ) {
                result.push(byte as char);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}

fn parse_query_param<'a>(query: &'a str, key: &str) -> Option<String> {
    query.split('&').find_map(|param| {
        let (k, v) = param.split_once('=')?;
        if k == key {
            Some(percent_decode(v))
        } else {
            None
        }
    })
}

fn start_api_server(handle: tauri::AppHandle) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", API_PORT)) {
        Ok(l) => {
            log::info!("API server listening on 127.0.0.1:{}", API_PORT);
            l
        }
        Err(e) => {
            log::error!("Failed to start API server: {}", e);
            return;
        }
    };

    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let handle = handle.clone();

        std::thread::spawn(move || {
            let reader_stream = match stream.try_clone() {
                Ok(s) => s,
                Err(_) => return,
            };
            let mut reader = BufReader::new(reader_stream);
            let mut request_line = String::new();
            if reader.read_line(&mut request_line).is_err() {
                return;
            }

            let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
            if parts.len() < 2 {
                return;
            }

            let full_path = parts[1];
            let (path, query) = match full_path.split_once('?') {
                Some((p, q)) => (p, Some(q)),
                None => (full_path, None),
            };

            let (status, body) = match path {
                "/health" => (
                    "200 OK",
                    r#"{"status":"ok","port":17321}"#.to_string(),
                ),
                "/screenshot" => {
                    let custom_path = query.and_then(|q| parse_query_param(q, "path"));
                    match do_screenshot(&handle, custom_path, None) {
                        Ok(p) => {
                            let sim = get_sim_context();
                            let result = ScreenshotResult { path: p, sim };
                            let _ = handle.emit("screenshot-taken", &result);
                            let body = serde_json::to_string(&result).unwrap_or_default();
                            ("200 OK", body)
                        },
                        Err(e) => (
                            "500 Internal Server Error",
                            format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\"")),
                        ),
                    }
                }
                "/screenshots" => {
                    let state = handle.state::<MultiFrameStore>();
                    let mut store = state.results.lock().unwrap_or_else(|e| e.into_inner());
                    let results: Vec<ScreenshotResult> = store.drain(..).collect();
                    if !results.is_empty() {
                        let _ = handle.emit("multi-screenshots-taken", &results);
                    }
                    let body = serde_json::to_string(&results).unwrap_or_default();
                    ("200 OK", body)
                }
                "/context" => {
                    let sim = get_sim_context();
                    let body = serde_json::to_string(&sim).unwrap_or_default();
                    ("200 OK", body)
                }
                _ => (
                    "404 Not Found",
                    r#"{"error":"not found"}"#.to_string(),
                ),
            };

            let response = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        });
    }
}

#[derive(Serialize, Clone)]
struct SimulatorWindow {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    name: String,
}

#[derive(Serialize, Clone)]
struct DesktopWindow {
    app: String,
    title: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Serialize, Clone)]
struct DesktopLayout {
    windows: Vec<DesktopWindow>,
    arranged: bool,
}

#[tauri::command]
fn get_simulator_window() -> Result<Option<SimulatorWindow>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"tell application "System Events"
    if not (exists process "Simulator") then return "none"
    tell process "Simulator"
        set frontWindow to front window
        set {x, y} to position of frontWindow
        set {w, h} to size of frontWindow
        set winName to name of frontWindow
        return "" & x & "," & y & "," & w & "," & h & "," & winName
    end tell
end tell"#)
        .output()
        .map_err(|e| format!("osascript failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("osascript error: {}", stderr));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if result == "none" || result.is_empty() {
        return Ok(None);
    }

    let parts: Vec<&str> = result.splitn(5, ',').collect();
    if parts.len() < 4 {
        return Err(format!("Unexpected output: {}", result));
    }

    Ok(Some(SimulatorWindow {
        x: parts[0].trim().parse().unwrap_or(0),
        y: parts[1].trim().parse().unwrap_or(0),
        width: parts[2].trim().parse().unwrap_or(0),
        height: parts[3].trim().parse().unwrap_or(0),
        name: parts.get(4).unwrap_or(&"Simulator").trim().to_string(),
    }))
}

#[tauri::command]
async fn attach_to_simulator(app: tauri::AppHandle) -> Result<SimulatorWindow, String> {
    let sim = get_simulator_window()?.ok_or("Simulator not running")?;

    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    // Position Fudo window at the simulator's position
    let phys_x = ((sim.x + 25) as f64 * scale) as i32;
    let phys_y = (sim.y as f64 * scale) as i32;
    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(phys_x, phys_y)))
        .map_err(|e| e.to_string())?;

    // Resize window to match simulator
    let phys_w = (sim.width as f64 * scale) as u32;
    let phys_h = (sim.height as f64 * scale) as u32;
    window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(phys_w, phys_h)))
        .map_err(|e| e.to_string())?;

    Ok(sim)
}

#[tauri::command]
fn arrange_desktop_layout() -> Result<DesktopLayout, String> {
    // Single lightweight AppleScript: only query Simulator and Fudo, then arrange layers
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"tell application "System Events"
    set result to ""
    set hasSim to exists process "Simulator"
    set hasFudo to exists process "Fudo"

    if hasSim then
        try
            tell process "Simulator"
                repeat with win in windows
                    set {x, y} to position of win
                    set {w, h} to size of win
                    set winName to name of win
                    set result to result & "Simulator|||" & winName & "|||" & x & "," & y & "," & w & "," & h & (ASCII character 10)
                end repeat
            end tell
        end try
    end if

    if hasFudo then
        try
            tell process "Fudo"
                repeat with win in windows
                    set {x, y} to position of win
                    set {w, h} to size of win
                    set winName to name of win
                    set result to result & "Fudo|||" & winName & "|||" & x & "," & y & "," & w & "," & h & (ASCII character 10)
                end repeat
            end tell
        end try
    end if

    -- Arrange layers: Simulator second, Fudo on top
    if hasSim then
        set frontmost of process "Simulator" to true
        delay 0.1
    end if
    if hasFudo then
        set frontmost of process "Fudo" to true
    end if

    return result
end tell"#)
        .output()
        .map_err(|e| format!("Failed to arrange windows: {}", e))?;

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let mut windows = Vec::new();
    let mut has_simulator = false;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(3, "|||").collect();
        if parts.len() < 3 {
            continue;
        }
        let app = parts[0].to_string();
        let title = parts[1].to_string();
        let coords: Vec<&str> = parts[2].split(',').collect();
        if coords.len() < 4 {
            continue;
        }
        if app == "Simulator" {
            has_simulator = true;
        }
        windows.push(DesktopWindow {
            app,
            title,
            x: coords[0].trim().parse().unwrap_or(0),
            y: coords[1].trim().parse().unwrap_or(0),
            width: coords[2].trim().parse().unwrap_or(0),
            height: coords[3].trim().parse().unwrap_or(0),
        });
    }

    Ok(DesktopLayout {
        windows,
        arranged: has_simulator,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MultiFrameStore {
            results: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start HTTP API server for CLI access
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                start_api_server(handle);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_screenshot, get_simulator_window, attach_to_simulator, arrange_desktop_layout, store_multi_frame_results])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
