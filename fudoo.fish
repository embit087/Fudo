function fudoo
    # Try multi-frame endpoint first
    set -l multi_response (curl -s --connect-timeout 2 http://localhost:17321/screenshots 2>/dev/null)
    if test $status -eq 0; and test "$multi_response" != "[]"; and string match -q '*"path"*' -- "$multi_response"
        set -l result (echo "$multi_response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for i, frame in enumerate(data):
    print(f'frame{i+1} - {frame[\"path\"]}')
")
        echo "$result" | pbcopy
        echo "$result"
        return 0
    end

    # Fall back to single screenshot
    set -l api_response (curl -s --connect-timeout 1 http://localhost:17321/screenshot 2>/dev/null)
    if test $status -eq 0; and string match -q '*"path"*' -- "$api_response"
        set -l path (string match -r '"path":"([^"]+)"' -- "$api_response")[2]
        if test -n "$path"
            set -l result "frame1 - $path"
            echo "$result" | pbcopy
            echo "$result"
            return 0
        end
    end

    echo "Fudo app not running or no screenshots available"
    return 1
end
