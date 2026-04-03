function fudo
    # If fudo app is running, use its API
    set -l api_response (curl -s --connect-timeout 1 http://localhost:17321/screenshot 2>/dev/null)
    if test $status -eq 0; and string match -q '*"path"*' -- "$api_response"
        set -l annotated_path (string match -r '"path":"([^"]+)"' -- "$api_response")[2]
        if test -n "$annotated_path"
            echo $annotated_path

            # Get view context from app container (same as fallback)
            set -l container (xcrun simctl get_app_container booted com.objsinc.shizuku data 2>/dev/null)
            if test $status -eq 0; and test -n "$container"
                set -l view_file "$container/Documents/current_view.txt"
                if test -f "$view_file"
                    set -l current_view (cat "$view_file")
                    set -l root /Users/objsinc-macair-00/embitious/shizuku-project/shizuku-app
                    set -l src $root/Sources/ShizukuApp

                    switch $current_view
                        case explore
                            set dirs Views/Explore Views/Canvas Views/Materials Views/Queue Views/Recorder
                            set vms ExploreViewModel ConversationViewModel MessagingViewModel MaterialsViewModel QueueViewModel RecorderViewModel DescribeImageViewModel CanvasViewModel
                        case study
                            set dirs Views/Study Views/Practice Views/Typing
                            set vms SessionViewModel SelectionViewModel PracticeViewModel TypingViewModel StudyListViewModel
                        case studylist
                            set dirs Views/StudyList
                            set vms StudyListViewModel TypingViewModel
                        case profile
                            set dirs Views/Profile Views/Settings
                            set vms ProfileViewModel SettingsViewModel
                        case '*'
                            return 0
                    end

                    echo ""
                    echo "View: $current_view"
                    echo "Files:"
                    for d in $dirs
                        for f in $src/$d/*.swift
                            echo "  "(string replace "$root/" "" "$f")
                        end
                    end
                    for vm in $vms
                        echo "  Sources/ShizukuApp/ViewModels/$vm.swift"
                    end
                end
            end
            return 0
        end
    end

    # Fallback: regular screenshot when app is not running
    set -l timestamp (date +%Y%m%d_%H%M%S)
    set -l filepath /private/tmp/sim-screenshot-$timestamp.png
    xcrun simctl io booted screenshot "$filepath" 2>/dev/null
    or begin
        echo "No booted simulator found"
        return 1
    end
    echo $filepath

    # Read current view from app container
    set -l container (xcrun simctl get_app_container booted com.objsinc.shizuku data 2>/dev/null)
    or return 0
    set -l view_file "$container/Documents/current_view.txt"
    if not test -f "$view_file"
        return 0
    end
    set -l current_view (cat "$view_file")
    set -l root /Users/objsinc-macair-00/embitious/shizuku-project/shizuku-app
    set -l src $root/Sources/ShizukuApp

    switch $current_view
        case explore
            set dirs Views/Explore Views/Canvas Views/Materials Views/Queue Views/Recorder
            set vms ExploreViewModel ConversationViewModel MessagingViewModel MaterialsViewModel QueueViewModel RecorderViewModel DescribeImageViewModel CanvasViewModel
        case study
            set dirs Views/Study Views/Practice Views/Typing
            set vms SessionViewModel SelectionViewModel PracticeViewModel TypingViewModel StudyListViewModel
        case studylist
            set dirs Views/StudyList
            set vms StudyListViewModel TypingViewModel
        case profile
            set dirs Views/Profile Views/Settings
            set vms ProfileViewModel SettingsViewModel
        case '*'
            return 0
    end

    echo ""
    echo "View: $current_view"
    echo "Files:"
    for d in $dirs
        for f in $src/$d/*.swift
            echo "  "(string replace "$root/" "" "$f")
        end
    end
    for vm in $vms
        echo "  Sources/ShizukuApp/ViewModels/$vm.swift"
    end
end
