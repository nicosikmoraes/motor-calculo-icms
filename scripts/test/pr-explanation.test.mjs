import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkExplanation } from '../check-pr-explanation.mjs';

test('rejeita PR sem explicação e PR com explicação curta', () => {
  assert.equal(checkExplanation(null).valid, false);
  assert.equal(checkExplanation(`## Resumo\n${'x'.repeat(300)}`).valid, false);
  assert.equal(checkExplanation('## Explicação\nUma alteração.').valid, false);
});

test('aceita 250 caracteres na seção de explicação, inclusive em CRLF', () => {
  assert.deepEqual(checkExplanation(`## Explicação\r\n${'á'.repeat(250)}\r\n## Validação\r\nNão executada`), { valid: true, length: 250 });
  assert.equal(checkExplanation(`## Explicação\n${'á'.repeat(249)}`).valid, false);
});

test('não conta os comentários do template nem outras seções', () => {
  assert.equal(checkExplanation(`## Explicação\n<!-- ${'x'.repeat(500)} -->\nCurta\n## Validação\n${'x'.repeat(500)}`).valid, false);
});

test('não aceita uma seção falsa dentro de um comentário', () => {
  assert.equal(checkExplanation(`<!--\n## Explicação\n${'x'.repeat(500)}\n-->`).valid, false);
});

test('não permite completar a explicação apenas com espaços', () => {
  assert.equal(checkExplanation(`## Explicação\n${' '.repeat(300)}abc`).valid, false);
});
