import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MINIMUM_EXPLANATION_LENGTH = 250;

export function checkExplanation(body) {
  const text = typeof body === 'string' ? body.replace(/<!--[\s\S]*?-->/gu, '').replace(/\r\n/gu, '\n') : '';
  const heading = /^##[ \t]+Explica[çc][ãa]o[ \t]*$/imu.exec(text);
  const section = heading ? text.slice(heading.index + heading[0].length).split(/^#{1,2}[ \t]+/mu)[0] : '';
  const explanation = section.trim().replace(/\s+/gu, ' ');
  const length = [...explanation].length;
  return { valid: length >= MINIMUM_EXPLANATION_LENGTH, length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const bodyFile = process.argv[2] === '--body-file' ? process.argv[3] : undefined;
  const body = bodyFile
    ? readFileSync(bodyFile, 'utf8')
    : JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.body;
  const result = checkExplanation(body);
  if (!result.valid) {
    console.error(`Portão de Entendimento: escreva pelo menos ${MINIMUM_EXPLANATION_LENGTH} caracteres na seção "## Explicação" (${result.length} encontrados).`);
    process.exitCode = 1;
  } else {
    console.log(`Portão de Entendimento aprovado: ${result.length} caracteres na explicação.`);
  }
}
