const paths = {
  home: '<path d="m3.5 10.8 8.5-7 8.5 7"/><path d="M5.5 9.8v9.7h13V9.8"/><path d="M9.2 19.5v-5.7h5.6v5.7"/>',
  book: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 16h14M8 21h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5.4 20.5a6.6 6.6 0 0 1 13.2 0"/>',
  search: '<circle cx="10.8" cy="10.8" r="7.1"/><path d="m16.1 16.1 4.2 4.2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9.5 18 6-6-6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.3 3.2M6.3 6.3C3.5 8.1 2 12 2 12s3.5 6 10 6a9 9 0 0 0 3.5-.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/>',
  archive: '<path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3zM9 11h6"/>',
  restore: '<path d="M4 8v5h5"/><path d="M5.7 17a8 8 0 1 0 .2-10.2L4 8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  shelves: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 12h18"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>',
  download: '<path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/>',
  location: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 3.2 2.4c-.8.3-.8 1.1-.8 1.6M12 17h.01"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H8l-5 2 1.7-4.2A8 8 0 1 1 21 12z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};

export function icon(name, label = "") {
  const body = paths[name] || paths.info;
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg ${aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

