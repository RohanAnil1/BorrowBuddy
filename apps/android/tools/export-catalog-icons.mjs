import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { writeFile } from 'node:fs/promises';

// Preserve the installed website icon geometry in Android vector drawables.
const names = { Search: 'search', ImageOff: 'image_off', MapPin: 'map_pin',
  PackageSearch: 'package_search', PlusCircle: 'plus_circle', Calendar: 'calendar', X: 'x', ChevronDown: 'chevron_down',
  CalendarDays: 'calendar_days', Wallet: 'wallet', Star: 'star', MessageSquare: 'message_square',
  Hourglass: 'hourglass', PackageOpen: 'package_open', CalendarClock: 'calendar_clock',
  Laptop: 'laptop', Camera: 'camera', Gamepad2: 'gamepad', Dumbbell: 'dumbbell', Book: 'book', Wrench: 'wrench', Fan: 'fan', Box: 'box',
  Check: 'check', Inbox: 'inbox', Pause: 'pause', Play: 'play', Trash2: 'trash',
  Receipt: 'receipt', Map: 'map', LogOut: 'log_out', BellRing: 'bell_ring', CheckCheck: 'check_check',
  ShieldCheck: 'shield_check', CalendarCheck: 'calendar_check', MessagesSquare: 'messages_square', ArrowLeft: 'arrow_left', Send: 'send', AlertTriangle: 'alert_triangle', ExternalLink: 'external_link' };
for (const [name, output] of Object.entries(names)) {
  const svg = renderToStaticMarkup(createElement(icons[name]));
  const paths = [...svg.matchAll(/<(path|circle|rect|line|polyline|polygon)\b([^>]*)\/?\s*>/g)].map(([, tag, raw]) => {
    const a = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const n = key => Number(a[key] || 0);
    if (tag === 'path') return a.d;
    if (tag === 'circle') return `M${n('cx') - n('r')},${n('cy')}a${n('r')},${n('r')} 0 1,0 ${2 * n('r')},0a${n('r')},${n('r')} 0 1,0 ${-2 * n('r')},0`;
    if (tag === 'line') return `M${a.x1},${a.y1}L${a.x2},${a.y2}`;
    if (tag === 'polyline' || tag === 'polygon') return `M${a.points.trim().replace(/\s+/g, 'L')}${tag === 'polygon' ? 'Z' : ''}`;
    const x = n('x'), y = n('y'), w = n('width'), h = n('height'), r = n('rx');
    return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
  });
  if (!paths.length || paths.some(path => !path)) throw new Error(`Missing source paths: ${name}`);
  await writeFile(new URL(`../app/src/main/res/drawable/ic_${output}.xml`, import.meta.url),
    `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n` +
    paths.map(path => `    <path android:pathData="${path}" android:fillColor="@android:color/transparent" android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />`).join('\n') + '\n</vector>\n');
  if (name === 'Star') await writeFile(new URL('../app/src/main/res/drawable/ic_star_filled.xml', import.meta.url),
    `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n` +
    paths.map(path => `    <path android:pathData="${path}" android:fillColor="#FFFFFFFF" android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />`).join('\n') + '\n</vector>\n');
}
console.log(`Exported ${Object.keys(names).length} source Lucide icons`);
