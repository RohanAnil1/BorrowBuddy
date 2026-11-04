# Android launcher resources

These are exact copies of the integrated application's resources. Copy `res/`
into an Android module, preserving its folders and resource names. The existing
BorrowBuddy application supports API 31 and newer; all supported devices use
adaptive icons. Android 13 and newer can use the monochrome layer for themed
icons. Foreground and background are separate; the launcher supplies the mask.

Use these manifest attributes on the application:

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

The icon-only resources do not change navigation, permissions, authentication or
application signing. The standalone 512 px preview is in `../digital/`.
Official reference: [Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
