# Over-the-air updates (no reinstalling)

The app (iOS .ipa and Android .apk) checks `https://app.unimate.my/ota/manifest` when it opens and when it
comes back to the front. If there is a newer JS build for the same `runtimeVersion` (app.json), it downloads it
and restarts into it.

Publish after a JS-only change:

    node tools/ota/publish.js /tmp/ota        # builds iOS + Android bundles and manifests
    # copy /tmp/ota into the web build as dist-web/ota/ and deploy app.unimate.my

Native changes (new native module, permissions, app.json plugins) still need a new .ipa/.apk:
bump `runtimeVersion` in app.json so old installs don't get JS they can't run.
