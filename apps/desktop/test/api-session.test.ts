import { describe, expect, it, vi } from 'vitest'
import { createApiSession, SESSION_EXPIRED_MESSAGE, SIGNED_OUT_MESSAGE } from '../src/main/modules/accounts/adapters/http/api-session'

type Reply = { status: number; body?: unknown }

/** fetch falso: responde em ordem e guarda o que foi enviado. */
function fakeApi(...replies: Reply[]) {
  const sent: Array<{ url: string; method: string; headers: Headers; body?: string }> = []
  const fetchImpl = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    sent.push({ url: String(input), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body as string | undefined })
    const reply = replies.shift()
    if (!reply) throw new Error('resposta não configurada')
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent }
}

const base = () => new URL('http://127.0.0.1:3000')
const loginOk = { status: 200, body: { data: { accessToken: 'header.payload.assinatura', tokenType: 'Bearer', expiresIn: 7200 } } }
const meOk = { status: 200, body: { data: { id: 'u1', email: 'ana@example.test', role: 'SUPPORTER', createdAt: '2026-11-17T00:00:00Z' } } }

describe('sessão da API no processo main', () => {
  it('entra lendo o token de dentro de data, e não da raiz da resposta', async () => {
    const { fetchImpl, sent } = fakeApi(loginOk, meOk)
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })

    await expect(session.signIn(' Ana@Example.test ', 'senha-certa')).resolves.toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    expect(sent[0]).toMatchObject({ url: 'http://127.0.0.1:3000/auth/login', method: 'POST' })
    expect(JSON.parse(sent[0].body!)).toEqual({ email: ' Ana@Example.test ', password: 'senha-certa' })
    expect(sent[0].headers.has('Authorization')).toBe(false)
    expect(sent[1].headers.get('Authorization')).toBe('Bearer header.payload.assinatura')
    expect(session.current()).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
  })

  it('CA13: anexa o Bearer em toda chamada depois do login, num ponto só', async () => {
    const { fetchImpl, sent } = fakeApi(loginOk, meOk, { status: 200, body: { data: {} } }, { status: 201, body: { data: {} } })
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })
    await session.signIn('ana@example.test', 'senha-certa')

    await session.request('/donation-orders/current', { headers: { 'X-Donation-Intent': 'intencao-1234567890' } })
    await session.request('/donation-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

    for (const call of sent.slice(2)) expect(call.headers.get('Authorization')).toBe('Bearer header.payload.assinatura')
    expect(sent[2].headers.get('X-Donation-Intent')).toBe('intencao-1234567890')
  })

  it('o resultado do login para o renderer nunca contém o token', async () => {
    const { fetchImpl } = fakeApi(loginOk, meOk)
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })
    const result = await session.signIn('ana@example.test', 'senha-certa')
    expect(JSON.stringify(result)).not.toContain('assinatura')
    expect(JSON.stringify(session.current())).not.toContain('assinatura')
  })

  it('CA14: um 401 no meio do uso descarta o token, avisa a janela e explica', async () => {
    const onExpired = vi.fn()
    const { fetchImpl, sent } = fakeApi(loginOk, meOk, { status: 401, body: { error: { statusCode: 401, message: 'Não autenticado' } } })
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired })
    await session.signIn('ana@example.test', 'senha-certa')

    await expect(session.request('/donation-orders/current', {})).rejects.toThrow(SESSION_EXPIRED_MESSAGE)
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(session.current()).toBeNull()

    // A chamada seguinte nem sai (não há mais token), e não dispara outro aviso de expiração.
    await expect(session.request('/donation-orders/current', {})).rejects.toThrow(SIGNED_OUT_MESSAGE)
    expect(sent).toHaveLength(3)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('sem sessão, nem chama a API protegida', async () => {
    const { fetchImpl } = fakeApi()
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })
    await expect(session.request('/donation-orders/current', {})).rejects.toThrow(SIGNED_OUT_MESSAGE)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('um 401 atrasado de um token antigo não derruba a sessão nova', async () => {
    const onExpired = vi.fn()
    let releaseOld!: (response: Response) => void
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(input)).pathname
      calls.push(`${path} ${new Headers(init.headers).get('Authorization') ?? '-'}`)
      if (path === '/auth/login') {
        const token = calls.filter((call) => call.startsWith('/auth/login')).length === 1 ? 'antigo' : 'novo'
        return new Response(JSON.stringify({ data: { accessToken: token, tokenType: 'Bearer', expiresIn: 7200 } }), { status: 200 })
      }
      if (path === '/auth/me') return new Response(JSON.stringify(meOk.body), { status: 200 })
      return new Promise<Response>((resolve) => { releaseOld = resolve })
    }) as unknown as typeof fetch
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired })

    await session.signIn('ana@example.test', 'senha-certa')
    const slow = session.request('/donation-orders/current', {})
    await session.signIn('ana@example.test', 'senha-certa')
    releaseOld(new Response(null, { status: 401 }))

    await expect(slow).rejects.toThrow(SESSION_EXPIRED_MESSAGE)
    expect(session.current()).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('login recusado não é sessão expirada: mostra a mensagem da API e não avisa a janela', async () => {
    const onExpired = vi.fn()
    const { fetchImpl } = fakeApi({ status: 401, body: { error: { statusCode: 401, message: 'E-mail ou senha inválidos' } } })
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired })
    await expect(session.signIn('ana@example.test', 'errada')).rejects.toThrow('E-mail ou senha inválidos')
    expect(onExpired).not.toHaveBeenCalled()
    expect(session.current()).toBeNull()
  })

  it('cria a conta e já entra; e-mail repetido vira uma mensagem para a pessoa', async () => {
    const created = { status: 201, body: { data: { id: 'u1', email: 'ana@example.test', role: 'SUPPORTER', createdAt: 'x' } } }
    const { fetchImpl, sent } = fakeApi(created, loginOk, meOk, { status: 409, body: { error: { statusCode: 409, message: 'E-mail já cadastrado' } } })
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })

    await expect(session.register('ana@example.test', 'senha-certa')).resolves.toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    expect(sent.map((call) => new URL(call.url).pathname)).toEqual(['/auth/register', '/auth/login', '/auth/me'])
    await expect(session.register('ana@example.test', 'senha-certa')).rejects.toThrow('Já existe uma conta com este e-mail. Entre com ela.')
  })

  it('troca de conta é atômica: se a confirmação falha, a sessão anterior fica inteira e nada vira "sessão expirada"', async () => {
    const onExpired = vi.fn()
    const loginB = { status: 200, body: { data: { accessToken: 'token-de-b', tokenType: 'Bearer', expiresIn: 7200 } } }
    const replies: Array<Reply | Error> = [loginOk, meOk, loginB, new Error('fetch failed'), loginB, { status: 401 }, { status: 200, body: { data: {} } }]
    const sent: Headers[] = []
    const fetchImpl = vi.fn(async (_input: URL | string, init: RequestInit = {}) => {
      sent.push(new Headers(init.headers))
      const reply = replies.shift()!
      if (reply instanceof Error) throw reply
      return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status })
    }) as unknown as typeof fetch
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired })
    await session.signIn('ana@example.test', 'senha-certa')

    await expect(session.signIn('bia@example.test', 'senha-da-bia')).rejects.toThrow('fetch failed')
    expect(session.current()).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    await expect(session.signIn('bia@example.test', 'senha-da-bia')).rejects.toThrow('Não foi possível entrar agora')
    expect(session.current()).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    expect(onExpired).not.toHaveBeenCalled()

    // As chamadas seguintes continuam saindo com o token de quem aparece na tela.
    await session.request('/donation-orders/current', {})
    expect(sent.at(-1)!.get('Authorization')).toBe('Bearer header.payload.assinatura')
  })

  it('sair descarta o token', async () => {
    const { fetchImpl } = fakeApi(loginOk, meOk)
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })
    await session.signIn('ana@example.test', 'senha-certa')
    session.signOut()
    expect(session.current()).toBeNull()
    await expect(session.request('/auth/me', {})).rejects.toThrow(SIGNED_OUT_MESSAGE)
  })

  it('US11: a sessão traz o papel confirmado pelo /auth/me; sem papel válido, não entra', async () => {
    const adminMe = { status: 200, body: { data: { id: 'u2', email: 'adm@example.test', role: 'ADMIN', createdAt: 'x' } } }
    const noRole = { status: 200, body: { data: { id: 'u3', email: 'x@example.test', createdAt: 'x' } } }
    const { fetchImpl } = fakeApi(loginOk, adminMe, loginOk, noRole)
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired: vi.fn() })
    await expect(session.signIn('adm@example.test', 'senha-certa')).resolves.toEqual({ email: 'adm@example.test', role: 'ADMIN' })
    await expect(session.signIn('x@example.test', 'senha-certa')).rejects.toThrow('Não foi possível entrar agora')
    expect(session.current()).toEqual({ email: 'adm@example.test', role: 'ADMIN' })
  })

  it('CA10: um 403 não é sessão expirada: a sessão continua e a janela não é avisada', async () => {
    const onExpired = vi.fn()
    const { fetchImpl } = fakeApi(loginOk, meOk, { status: 403, body: { error: { statusCode: 403, message: 'Sem permissão para esta ação' } } })
    const session = createApiSession({ baseUrl: base, fetchImpl, onExpired })
    await session.signIn('ana@example.test', 'senha-certa')

    await expect(session.request('/admin/donation-orders', {})).resolves.toMatchObject({ status: 403 })
    expect(onExpired).not.toHaveBeenCalled()
    expect(session.current()).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
  })
})

