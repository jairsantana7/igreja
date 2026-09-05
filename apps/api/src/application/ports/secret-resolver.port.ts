export interface SecretResolver {
  resolve(reference: string): string;
}
