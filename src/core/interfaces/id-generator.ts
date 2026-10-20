export abstract class IdGenerator {
  abstract hex(bytes: number): string;
  abstract uuid(): string;
}
