function fudos
    set -l api_response (curl -s --connect-timeout 2 http://localhost:17321/screenshots 2>/dev/null)
    if test $status -ne 0
        echo "Fudo app not running"
        return 1
    end

    if test "$api_response" = "[]"
        echo "No multi-frame screenshots available"
        return 1
    end

    echo "$api_response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for i, frame in enumerate(data):
    print(f'Frame {i+1}: {frame[\"path\"]}')
    sim = frame.get('sim', {})
    view = sim.get('view')
    if view:
        print(f'  View: {view}')
    files = sim.get('files', [])
    if files:
        print('  Files:')
        for f in files:
            print(f'    {f}')
    if i < len(data) - 1:
        print()
"
end
