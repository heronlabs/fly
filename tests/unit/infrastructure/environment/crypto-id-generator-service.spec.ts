import {CryptoIdGeneratorService} from '../../../../src/infrastructure/environment/crypto-id-generator-service';

describe('CryptoIdGeneratorService', () => {
  const service = new CryptoIdGeneratorService();

  it('Should return 6 hex chars for hex(3)', () => {
    expect(service.hex(3)).toMatch(/^[0-9a-f]{6}$/);
  });

  it('Should return a v4 uuid', () => {
    expect(service.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
