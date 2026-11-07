#!/usr/bin/env bash
# Inside the emulator job: Arabic phone, the app installed with its permissions, the test video in the gallery, then
# the story flow; screenshots, Maestro's report and the phone log end up in ./out.
set -x
NAME=$1; API=$2
mkdir -p out
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
# a sign-in link lasts minutes, so it is made only now: wait for it on the "e2e-link" branch (first line: this run's id)
if [ -z "$LOGIN_LINK" ]; then
  echo "waiting for the sign-in link"
  for i in $(seq 1 90); do
    T=$(curl -fsS -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/$GITHUB_REPOSITORY/contents/link.txt?ref=e2e-link" 2>/dev/null)
    [ "$(echo "$T" | head -1)" = "$GITHUB_RUN_ID" ] && LOGIN_LINK=$(echo "$T" | sed -n 2p) && break
    sleep 10
  done
fi
[ -z "$LOGIN_LINK" ] && echo "no sign-in link" > out/result.txt && exit 0
START=$(date +%s)
~/.maestro/bin/maestro test --env LOGIN_LINK="$LOGIN_LINK" --format junit --output out/report.xml --test-output-dir out e2e/story-long-video.yaml > out/maestro.log 2>&1
echo "exit=$? seconds=$(( $(date +%s) - START ))" > out/result.txt
adb logcat -d -v time | grep -iE "ReactNativeJS|AndroidRuntime|FATAL|ExpoUpdates|unimate" | tail -400 > out/logcat.txt
cp -f *.png out/ 2>/dev/null || true; find out -name "*.png" | head -40
exit 0
