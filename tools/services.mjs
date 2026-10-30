import { manageService } from '../packages/applet-tools/src/services.mjs';
const [action, directory, device, ...extra] = process.argv.slice(2);
try {
  if (!action || !directory || !device || extra.length) throw new Error('Usage: node tools/services.mjs start|status|stop|provision <applet-directory> <adb-device>');
  console.log(JSON.stringify(await manageService(action, directory, { device })));
} catch (error) { console.error(error.message); process.exitCode = 1; }
