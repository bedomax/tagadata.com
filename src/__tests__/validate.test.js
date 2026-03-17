const { parseNewsParams } = require('../validate');

const VALID_COUNTRIES = ['cl', 'ec', 'ma'];

describe('parseNewsParams', () => {
  // ---- country ----
  test('defaults country to cl when missing', () => {
    const { cc } = parseNewsParams({}, VALID_COUNTRIES);
    expect(cc).toBe('cl');
  });

  test('accepts valid countries', () => {
    expect(parseNewsParams({ country: 'ec' }, VALID_COUNTRIES).cc).toBe('ec');
    expect(parseNewsParams({ country: 'ma' }, VALID_COUNTRIES).cc).toBe('ma');
  });

  test('falls back to cl for unknown country', () => {
    expect(parseNewsParams({ country: 'us' }, VALID_COUNTRIES).cc).toBe('cl');
    expect(parseNewsParams({ country: '' }, VALID_COUNTRIES).cc).toBe('cl');
  });

  // ---- sort ----
  test('defaults sort to date', () => {
    expect(parseNewsParams({}, VALID_COUNTRIES).sort).toBe('date');
  });

  test('accepts score sort', () => {
    expect(parseNewsParams({ sort: 'score' }, VALID_COUNTRIES).sort).toBe('score');
  });

  test('ignores invalid sort values', () => {
    expect(parseNewsParams({ sort: 'random' }, VALID_COUNTRIES).sort).toBe('date');
    expect(parseNewsParams({ sort: 'DROP TABLE' }, VALID_COUNTRIES).sort).toBe('date');
  });

  // ---- limit ----
  test('defaults limit to 15', () => {
    expect(parseNewsParams({}, VALID_COUNTRIES).lim).toBe(15);
  });

  test('clamps limit to 1–100', () => {
    expect(parseNewsParams({ limit: '0' }, VALID_COUNTRIES).lim).toBe(1);
    expect(parseNewsParams({ limit: '50' }, VALID_COUNTRIES).lim).toBe(50);
    expect(parseNewsParams({ limit: '999' }, VALID_COUNTRIES).lim).toBe(100);
    expect(parseNewsParams({ limit: '-5' }, VALID_COUNTRIES).lim).toBe(1);
  });

  test('returns default for non-numeric limit', () => {
    expect(parseNewsParams({ limit: 'abc' }, VALID_COUNTRIES).lim).toBe(15);
  });

  // ---- offset ----
  test('defaults offset to 0', () => {
    expect(parseNewsParams({}, VALID_COUNTRIES).off).toBe(0);
  });

  test('clamps offset to 0–10000', () => {
    expect(parseNewsParams({ offset: '-1' }, VALID_COUNTRIES).off).toBe(0);
    expect(parseNewsParams({ offset: '100' }, VALID_COUNTRIES).off).toBe(100);
    expect(parseNewsParams({ offset: '99999' }, VALID_COUNTRIES).off).toBe(10000);
  });

  // ---- tag ----
  test('accepts valid tags', () => {
    expect(parseNewsParams({ tag: 'economía' }, VALID_COUNTRIES).tag).toBe('economía');
    expect(parseNewsParams({ tag: 'medio ambiente' }, VALID_COUNTRIES).tag).toBe('medio ambiente');
    expect(parseNewsParams({ tag: 'covid-19' }, VALID_COUNTRIES).tag).toBe('covid-19');
  });

  test('truncates tag at 50 chars', () => {
    const long = 'a'.repeat(80);
    const result = parseNewsParams({ tag: long }, VALID_COUNTRIES).tag;
    expect(result).toBe('a'.repeat(50));
  });

  test('throws 400 for tag with SQL metacharacters', () => {
    expect(() => parseNewsParams({ tag: "'; DROP TABLE news;--" }, VALID_COUNTRIES))
      .toThrow('Invalid tag');
    expect(() => parseNewsParams({ tag: '<script>alert(1)</script>' }, VALID_COUNTRIES))
      .toThrow('Invalid tag');
    expect(() => parseNewsParams({ tag: '1 OR 1=1' }, VALID_COUNTRIES))
      .toThrow('Invalid tag');
  });

  test('throws 400 for tag with only special chars', () => {
    expect(() => parseNewsParams({ tag: '!!!' }, VALID_COUNTRIES)).toThrow('Invalid tag');
  });

  test('returns null tag when not provided', () => {
    expect(parseNewsParams({}, VALID_COUNTRIES).tag).toBeNull();
  });

  // ---- source ----
  test('accepts valid source', () => {
    expect(parseNewsParams({ source: 'emol' }, VALID_COUNTRIES).source).toBe('emol');
  });

  test('throws 400 for source with special chars', () => {
    expect(() => parseNewsParams({ source: 'emol; DROP TABLE' }, VALID_COUNTRIES))
      .toThrow('Invalid source');
  });

  test('returns null source when not provided', () => {
    expect(parseNewsParams({}, VALID_COUNTRIES).source).toBeNull();
  });
});
