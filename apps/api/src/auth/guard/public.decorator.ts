import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Abre uma rota (ou um controller inteiro) para quem não tem token. Toda rota nasce
 * fechada pelo AuthGuard global; esquecer esta marca quebra a rota na hora, não abre um buraco.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
