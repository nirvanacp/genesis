export type IconName = 'reply' | 'repost' | 'like' | 'views' | 'share' | 'more' | 'folder' | 'search' | 'settings' | 'mail' | 'compose' | 'close' | 'bookmark' | 'play' | 'link' | 'verified';

const paths: Record<IconName, string> = {
  reply: 'M14.05 2.24h-4.1a7.95 7.95 0 0 0 0 15.9h.05v3.62l3.8-3.62h.25a7.95 7.95 0 0 0 0-15.9Z',
  repost: 'M4 8V5h13m-3-3 3 3-3 3M20 16v3H7m3-3-3 3 3 3M4 8l-3 3m3-3 3 3m13 5 3-3m-3 3-3-3',
  like: 'M12 21S2.5 15.4 2.5 8.7a5.2 5.2 0 0 1 9.5-3 5.2 5.2 0 0 1 9.5 3C21.5 15.4 12 21 12 21Z',
  views: 'M4 21V11m5 10V3m6 18v-7m5 7V7',
  share: 'M12 16V2m-5 5 5-5 5 5M4 13v8h16v-8',
  more: 'M4 12h.01M12 12h.01M20 12h.01',
  folder: 'M3 5h7l2 3h9v13H3V5Zm9 6v7m-3-3h6',
  search: 'M16.5 16.5 22 22M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
  settings: 'm9 3 1-2h4l1 2 3 2 2 .5 2 3.5-1 2v3l1 2-2 3.5-2 .5-3 2-1 2h-4l-1-2-3-2-2-.5L2 15l1-2v-3L2 8l2-3.5L6 5l3-2Zm7 9a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  compose: 'm16 3 5 5M3 21l5-1L22 6l-4-4L4 16l-1 5Z',
  close: 'm5 5 14 14M19 5 5 19',
  bookmark: 'M5 3h14v19l-7-5-7 5V3Z',
  play: 'm8 4 13 8-13 8V4Z',
  link: 'm9 15 6-6M7 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1',
  verified: 'm12 1 3 2 3 .5 1 3 3 2-.5 3 .5 3-3 2-1 3-3 .5-3 2-3-2-3-.5-1-3-3-2 .5-3L0 8.5l3-2 1-3 3-.5 3-2Z',
};

export function Icon({name}: {name: IconName}) {
  return <svg className={`icon icon-${name}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={paths[name]}/>
    {name === 'verified' && <path className="verified-check" d="m7 12 3 3 7-7"/>}
  </svg>;
}
