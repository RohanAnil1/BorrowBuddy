import assert from 'node:assert/strict';

const applicationId = 'in.borrowbuddy.android';

export function requireDisposableQaDevice(serial) {
  assert(serial, 'Select a dedicated Android QA device');
  assert(serial.startsWith('emulator-') || process.env.BORROWBUDDY_QA_DISPOSABLE_PHYSICAL_APP === '1',
    'Physical QA requires explicit opt-in for a disposable BorrowBuddy installation');
}

export async function resetQaApplication(runAdb, serial, apk) {
  requireDisposableQaDevice(serial);
  if (serial.startsWith('emulator-')) {
    return runAdb(['shell', 'pm', 'clear', '--user', '0', applicationId]);
  }
  // Some phone vendors reserve pm clear for privileged callers. Reinstall the
  // explicitly disposable QA package using Android's regular package manager.
  const installed = await runAdb(['shell', 'pm', 'path', applicationId]);
  if (installed.output.includes('package:')) {
    const removed = await runAdb(['uninstall', applicationId]);
    assert(removed.code === 0 && removed.output.includes('Success'), 'Disposable QA APK removal failed');
  }
  return runAdb(['install', apk]);
}
