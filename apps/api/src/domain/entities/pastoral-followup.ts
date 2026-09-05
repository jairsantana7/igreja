import { DomainError } from './errors';

export type FollowupNoteVisibility = 'private' | 'team';

export class FollowupStageDefinition {
  private constructor(readonly props: { name: string; color: string }) {}
  static create(input: { name: string; color: string }) {
    const props = { name: input.name.trim(), color: input.color.trim().toUpperCase() };
    if (props.name.length < 2 || props.name.length > 60) throw new DomainError('O nome da etapa deve ter entre 2 e 60 caracteres.');
    if (!/^#[0-9A-F]{6}$/.test(props.color)) throw new DomainError('Escolha uma cor válida para a etapa.');
    return new FollowupStageDefinition(props);
  }
}

export class FollowupTagDefinition {
  private constructor(readonly props: { name: string; color: string }) {}
  static create(input: { name: string; color: string }) {
    const props = { name: input.name.trim(), color: input.color.trim().toUpperCase() };
    if (props.name.length < 2 || props.name.length > 40) throw new DomainError('O nome da etiqueta deve ter entre 2 e 40 caracteres.');
    if (!/^#[0-9A-F]{6}$/.test(props.color)) throw new DomainError('Escolha uma cor válida para a etiqueta.');
    return new FollowupTagDefinition(props);
  }
}

export class FollowupNoteContent {
  private constructor(readonly props: { body: string; visibility: FollowupNoteVisibility }) {}
  static create(input: { body: string; visibility: FollowupNoteVisibility }) {
    const body = input.body.trim();
    if (body.length < 1 || body.length > 5_000) throw new DomainError('A anotação deve ter entre 1 e 5.000 caracteres.');
    if (!['private', 'team'].includes(input.visibility)) throw new DomainError('A visibilidade da anotação é inválida.');
    return new FollowupNoteContent({ body, visibility: input.visibility });
  }
}

export function normalizeNextAction(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DomainError('A data da próxima ação é inválida.');
  return date.toISOString();
}
