import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {parseHdiutilInfo} from '../../../../src/infrastructure/environment/hdiutil-info-parser';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../fixtures/hdiutil', name), 'utf8');

describe('parseHdiutilInfo', () => {
  it('Should read the mounted fly image', () => {
    expect(parseHdiutilInfo(fixture('info-mounted.json'))).toEqual([
      {
        imagePath: '/Users/user/Downloads/fly-0.7.0-arm64.dmg',
        mountPoints: ['/Volumes/fly 0.7.0-arm64'],
      },
    ]);
  });

  it('Should keep the order of the images', () => {
    expect(
      parseHdiutilInfo(fixture('info-two-images.json')).map(i => i.imagePath),
    ).toEqual([
      '/Users/user/Downloads/other-1.0.dmg',
      '/Users/user/Downloads/fly-0.7.0-arm64.dmg',
    ]);
  });

  it('Should skip entities without a mount point', () => {
    const json = JSON.stringify({
      images: [
        {
          'image-path': '/a.dmg',
          'system-entities': [{'dev-entry': '/dev/disk1'}],
        },
      ],
    });

    expect(parseHdiutilInfo(json)).toEqual([
      {imagePath: '/a.dmg', mountPoints: []},
    ]);
  });

  it('Should skip images without a path or entities, and bad entities', () => {
    const json = JSON.stringify({
      images: [
        null,
        'x',
        {'system-entities': []},
        {'image-path': 1, 'system-entities': []},
        {'image-path': '/b.dmg'},
        {
          'image-path': '/c.dmg',
          'system-entities': [
            null,
            'x',
            {'mount-point': 3},
            {'mount-point': '/V'},
          ],
        },
      ],
    });

    expect(parseHdiutilInfo(json)).toEqual([
      {imagePath: '/b.dmg', mountPoints: []},
      {imagePath: '/c.dmg', mountPoints: ['/V']},
    ]);
  });

  it.each([
    ['empty images', '{"images": []}'],
    ['images not an array', '{"images": 1}'],
    ['no images key', '{}'],
    ['null', 'null'],
    ['an array', '[]'],
    ['invalid JSON', 'not json'],
  ])('Should return [] for %s', (_name, stdout) => {
    expect(parseHdiutilInfo(stdout)).toEqual([]);
  });
});
