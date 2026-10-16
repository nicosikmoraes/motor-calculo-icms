const products = [
  { id: 'filter', note: '004261', item: '1', code: 'FLT-001', name: 'Filtro de óleo diesel', issuer: 'Distribuidora Araucária', ncm: '84212300', cfop: '1102', value: 395.83, declared: 47.50, calculated: 47.50, state: 'calculated' },
  { id: 'brake', note: '004261', item: '2', code: 'FR-022', name: 'Pastilha de freio dianteira', issuer: 'Distribuidora Araucária', ncm: '87083090', cfop: '1102', value: 765.00, declared: 86.10, calculated: 91.80, state: 'divergent' },
  { id: 'belt', note: '004261', item: '3', code: 'CR-010', name: 'Correia de transmissão', issuer: 'Distribuidora Araucária', ncm: '40103900', cfop: '1102', value: 200.00, declared: 24.00, calculated: null, state: 'pending' },
  { id: 'fluid', note: '004262', item: '1', code: 'FL-004', name: 'Fluido de freio DOT 4', issuer: 'Comercial Vale do Sol', ncm: '38190000', cfop: '1102', value: 150.00, declared: 18.00, calculated: 18.00, state: 'calculated' },
  { id: 'air', note: '004262', item: '2', code: 'FA-019', name: 'Filtro de ar do motor', issuer: 'Comercial Vale do Sol', ncm: '84213100', cfop: '1102', value: 280.00, declared: 33.60, calculated: 33.60, state: 'calculated' },
];
const money = value => value === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const difference = item => item.calculated === null ? null : Math.round((item.calculated - item.declared) * 100) / 100;
const status = item => item.state === 'pending' ? 'Pendente' : item.state === 'divergent' ? 'Divergência' : 'Calculado';
const badge = item => `<span class="badge ${item.state === 'pending' ? 'warning' : item.state === 'divergent' ? 'rose' : 'success'}">${status(item)}</span>`;
const main = document.querySelector('#detail-preview');
const search = document.querySelector('.product-search');
const filter = document.querySelector('.product-filter');
const openNotes = new Set(['004261']);
const openItems = new Set();
let variant = 'stack';
let area = 'notes';
function visibleProducts() {
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  return products.filter(item => [item.name, item.note, item.code, item.issuer].join(' ').toLocaleLowerCase('pt-BR').includes(query)
    && (filter.value === 'all' || filter.value === item.state || filter.value === 'calculated' && item.calculated !== null || filter.value === 'review' && item.state !== 'calculated'));
}
function analysis(item) {
  const message = item.state === 'pending' ? 'Confirme a finalidade da aquisição.' : item.state === 'divergent' ? 'Confira a diferença entre o valor declarado e o calculado.' : 'Valor declarado e calculado coincidem neste exemplo.';
  return `<details class="product-analysis" data-analysis="${item.id}" ${openItems.has(item.id) ? 'open' : ''}><summary><span>Dados e memória de cálculo</span><span aria-hidden="true">⌄</span></summary><div class="analysis-content"><dl><div><dt>Código</dt><dd>${item.code}</dd></div><div><dt>NCM</dt><dd>${item.ncm}</dd></div><div><dt>CFOP</dt><dd>${item.cfop}</dd></div><div><dt>Arquivo</dt><dd>NF-e_${item.note}.xml</dd></div></dl><p>${message}</p><small>Dados fictícios desta prévia.</small></div></details>`;
}
function productCard(item) {
  return `<article class="product-card ${item.state}"><header class="product-card-heading"><span class="item-index">${item.item}</span><div><h3>${item.name}</h3><p>${item.code} · NCM ${item.ncm} · CFOP ${item.cfop}</p></div>${badge(item)}</header><div class="product-values"><div class="value-product"><span>Valor do produto</span><strong>${money(item.value)}</strong></div><div class="value-declared"><span>ICMS declarado</span><strong>${money(item.declared)}</strong></div><div class="value-calculated"><span>ICMS calculado</span><strong>${money(item.calculated)}</strong></div><div class="value-difference"><span>Diferença</span><strong>${money(difference(item))}</strong></div></div><p class="product-amount-footer">Valor do produto <b>${money(item.value)}</b></p>${analysis(item)}</article>`;
}
function renderNotes() {
  const visible = visibleProducts(), notes = [...new Set(visible.map(item => item.note))];
  document.querySelector('#note-count').textContent = `${notes.length} de 2 notas`;
  document.querySelector('#note-cards').innerHTML = notes.length ? notes.map(note => {
    const items = visible.filter(item => item.note === note), all = products.filter(item => item.note === note);
    const attention = all.filter(item => item.state !== 'calculated').length;
    const calculated = all.filter(item => item.calculated !== null).length;
    return `<details class="document-shell" data-note="${note}" ${openNotes.has(note) || search.value || filter.value !== 'all' ? 'open' : ''}><summary class="document-summary"><span class="document-icon" aria-hidden="true">▤</span><span class="document-title"><b>NF-e ${note}<span>Série 01</span></b><small>${all[0].issuer}</small></span><span class="document-counts"><span>${all.length} produtos</span><span>${calculated} calculados</span></span><span class="badge ${attention ? 'warning' : 'success'}">${attention ? attention + ' para revisar' : 'Conferida'}</span><span class="document-chevron" aria-hidden="true">⌄</span></summary><div class="document-content"><div class="document-context"><span>Mercado Pinheiro Ltda.</span><span>15 out. 2026 · Produção</span></div><div class="product-cards">${items.map(productCard).join('')}</div></div></details>`;
  }).join('') : '<p class="no-products">Nenhum produto corresponde aos filtros.</p>';
}
function showArea(next) {
  area = next;
  if (next === 'review') filter.value = 'review';
  document.querySelector('#overview-area').hidden = next !== 'overview';
  document.querySelector('#notes-area').hidden = next === 'overview';
  document.querySelectorAll('[data-area]').forEach(button => { const selected = button.dataset.area === next; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  renderNotes();
}
search.addEventListener('input', renderNotes);
filter.addEventListener('change', () => { if (area === 'review' && filter.value !== 'review') showArea('notes'); else renderNotes(); });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter.value = button.dataset.filter; search.value = ''; showArea(button.dataset.filter === 'review' ? 'review' : 'notes'); }));
document.querySelectorAll('[data-area]').forEach(button => button.addEventListener('click', () => { if (button.dataset.area === 'notes') filter.value = 'all'; showArea(button.dataset.area); }));
document.querySelectorAll('button[data-variant]').forEach(button => button.addEventListener('click', () => { variant = button.dataset.variant; main.dataset.variant = variant; document.querySelectorAll('button[data-variant]').forEach(option => option.setAttribute('aria-pressed', String(option === button))); }));
document.querySelector('#note-cards').addEventListener('toggle', event => {
  const target = event.target;
  if (target.matches('[data-note]')) { if(target.open) openNotes.add(target.dataset.note); else openNotes.delete(target.dataset.note); }
  if (target.matches('[data-analysis]')) { if(target.open) openItems.add(target.dataset.analysis); else openItems.delete(target.dataset.analysis); }
}, true);
renderNotes();
document.querySelector('#excel-rows').innerHTML = products.map(item => `<tr><td>${item.note}</td><td>${item.item}</td><td>${item.name}</td><td class="numeric">${money(item.declared)}</td><td class="numeric">${money(item.calculated)}</td><td>${badge(item)}</td></tr>`).join('');
for (const [button, dialog] of [['excel-preview', 'excel-dialog'], ['files-preview', 'files-dialog'], ['audit-preview', 'audit-dialog']]) {
  document.getElementById(button).addEventListener('click', () => document.getElementById(dialog).showModal());
}
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target.closest('.close-dialog')) dialog.close(); }));
