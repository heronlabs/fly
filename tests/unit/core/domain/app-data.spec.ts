import {userDataFolder} from '../../../../src/core/domain/app-data';

describe('userDataFolder', () => {
  it('Should name the installed app folder fly', () => {
    expect(userDataFolder(true)).toBe('fly');
  });

  it('Should name the dev folder fly-dev', () => {
    expect(userDataFolder(false)).toBe('fly-dev');
  });
});
