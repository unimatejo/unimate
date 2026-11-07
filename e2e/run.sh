#!/usr/bin/env bash
# Inside the emulator job: Arabic phone, the app installed with its permissions, the test video in the gallery, then
# the story flow; screenshots, Maestro's report and the phone log end up in ./out.
set -x
NAME=$1; API=$2
mkdir -p out
[ -z "$LOGIN_LINK" ] && [ -f "$RUN_JSON" ] && LOGIN_LINK=$(python3 -c "import json;print(json.load(open('$RUN_JSON'))['link'])")
adb wait-for-device
adb root || true
adb shell "setprop persist.sys.locale ar-JO; setprop ctl.restart zygote" || true
sleep 25; adb wait-for-device; until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
adb install -r app-release.apk
for p in CAMERA RECORD_AUDIO READ_MEDIA_IMAGES READ_MEDIA_VIDEO READ_EXTERNAL_STORAGE POST_NOTIFICATIONS ACCESS_FINE_LOCATION; do adb shell pm grant jo.unimate.app android.permission.$p 2>/dev/null || true; done
adb shell mkdir -p /sdcard/DCIM/Camera
adb push test30.mp4 /sdcard/DCIM/Camera/test30.mp4
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/test30.mp4 || true
adb shell content call --method scan_volume --uri content://media --arg external_primary || true
adb logcat -c
START=$(date +%s)
~/.maestro/bin/maestro test --env LOGIN_LINK="$LOGIN_LINK" --format junit --output out/report.xml --test-output-dir out e2e/story-long-video.yaml > out/maestro.log 2>&1
echo "exit=$? seconds=$(( $(date +%s) - START ))" > out/result.txt
adb logcat -d -v time | grep -iE "ReactNativeJS|AndroidRuntime|FATAL|ExpoUpdates|unimate" | tail -400 > out/logcat.txt
cp -f *.png out/ 2>/dev/null || true; find out -name "*.png" | head -40
exit 0
