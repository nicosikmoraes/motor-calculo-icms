"""Extrai as duas tabelas integrais da Resolução SEFA/PR 1245/2025.

Uso: python3 scripts/extract-pr-st-mva.py caminho/ato.html caminho/saida.json
O HTML deve ser obtido da URL oficial abaixo. A execução não acessa a rede.
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SOURCE = 'https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibirImpressao&codAto=381258'


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.current = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'table' and dict(attrs).get('class') == 'tbato':
            self.current = []
        elif self.current is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag == 'td':
            self.cell = []
        elif self.cell is not None and tag == 'br':
            self.cell.append(' ')

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.current.append(self.row)
            self.row = None
        elif tag == 'table' and self.current is not None:
            self.tables.append(self.current)
            self.current = None


raw = Path(sys.argv[1]).read_bytes()
parser = Tables()
parser.feed(raw.decode('utf-8'))
assert len(parser.tables) == 2, 'O ato deve conter exatamente duas tabelas integrais.'
rows = []
for article, segment, table, expected_count in zip(
        [12, 16], ['HIGIENE_COSMETICS', 'CONSTRUCTION'], parser.tables, [69, 75]):
    assert len(table) == expected_count + 1, f'Tabela do art. {article} incompleta.'
    for index, cells in enumerate(table[1:], 1):
        assert len(cells) == 5 and cells[0] == str(index), f'Linha inválida: {cells}'
        cest = cells[1].replace('.', '')
        assert re.fullmatch(r'\d{7}', cest)
        ncm = cells[2].split()
        assert ncm and all(re.fullmatch(r'\d{2}(?:\.?\d){0,6}', code) for code in ncm), cells[2]
        mva = cells[4].replace(',', '.')
        assert re.fullmatch(r'\d+(?:\.\d+)?', mva), cells[4]
        rows.append({
            'id': f'pr-571-art-{article}-item-{index}-1245-2025',
            'article': article, 'item': str(index), 'segment': segment,
            'cest': cest, 'ncmPrefixes': [code.replace('.', '') for code in ncm],
            'description': cells[3], 'originalMvaPercent': mva,
        })
assert len({row['id'] for row in rows}) == len(rows)
data = {
    'id': 'pr-st-mva-1245-2025', 'version': 1,
    'validFrom': '2026-04-01', 'verifiedThrough': '2026-10-12',
    'legalBasis': 'Resolução SEFA/PR 571/2019, arts. 12 e 16, na redação da Resolução SEFA/PR 1245/2025',
    'sourceUrl': SOURCE, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'rows': rows,
}
Path(sys.argv[2]).parent.mkdir(parents=True, exist_ok=True)
Path(sys.argv[2]).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(f'{len(rows)} linhas extraídas; SHA-256 {data["sourceSha256"]}')
