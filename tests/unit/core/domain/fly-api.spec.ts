import {channels} from '../../../../src/core/domain/fly-api';

describe('fly-api channels', () => {
  it('Should name every channel as <area>:<kebab-action>', () => {
    for (const value of Object.values(channels)) {
      expect(value).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
    }
  });

  it('Should keep channel names unique', () => {
    expect(new Set(Object.values(channels)).size).toBe(
      Object.keys(channels).length,
    );
  });
});
