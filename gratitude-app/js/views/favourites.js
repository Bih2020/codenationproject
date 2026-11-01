// My Favourites: every gratitude the user has hearted.
import { entryCard, bindEntryActions, pageHeader } from '../ui.js';

export function title() {
  return 'My Favourites · Gladmoment';
}

export function render(ctx) {
  const favs = ctx.store.state.entries.filter((e) => e.favourite);
  return `${pageHeader('My Favourites', favs.length ? `${favs.length} meaningful ${favs.length === 1 ? 'moment' : 'moments'}` : 'Your most meaningful moments')}
  <div class="page">
    ${favs.length
      ? `<div class="entry-list" id="fav-list">${favs.map((e) => entryCard(e, { showDate: true })).join('')}</div>`
      : `<div class="empty card">
          <p class="empty-emoji" aria-hidden="true">💛</p>
          <p>Tap the heart on any gratitude to keep it here.</p>
          <a class="btn btn-soft" href="#/journal">Browse your journal</a>
        </div>`}
  </div>`;
}

export function mount(root, ctx) {
  const list = root.querySelector('#fav-list');
  if (list) bindEntryActions(list, ctx.store);
}
