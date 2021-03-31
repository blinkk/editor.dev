import {DocumentFormat, FrontMatter} from './frontMatter';
import test from 'ava';

test('combine handles empty string', t => {
  t.is(FrontMatter.combine({}), '');
});

test('combine handles simple front matter', t => {
  t.is(
    FrontMatter.combine({
      frontMatter: 'test: true',
      body: 'content',
    } as DocumentFormat),
    `---
test: true
---
content`
  );
});

test('combine option for trailing newline', t => {
  t.is(
    FrontMatter.combine(
      {
        frontMatter: 'test: true',
        body: 'content',
      } as DocumentFormat,
      {
        trailingNewline: true,
      }
    ),
    `---
test: true
---
content
`
  );
});

test('combine handles body only', t => {
  t.is(
    FrontMatter.combine({
      body: 'content',
    } as DocumentFormat),
    'content'
  );
});

test('combine handles front matter only', t => {
  t.is(
    FrontMatter.combine({
      frontMatter: 'test: true',
    } as DocumentFormat),
    `---
test: true
---`
  );
});

test('split handles empty string', t => {
  t.deepEqual(FrontMatter.split(''), {});
});

test('split handles null', t => {
  t.deepEqual(FrontMatter.split(null), {});
});

test('split handles simple front matter', t => {
  t.deepEqual(
    FrontMatter.split(`---
test: true
---
content`),
    {
      frontMatter: 'test: true',
      body: 'content',
    } as DocumentFormat
  );
});

test('split handles missing closing sentinel', t => {
  t.deepEqual(
    FrontMatter.split(`---
test: true
content`),
    {
      frontMatter: `test: true
content`,
    } as DocumentFormat
  );
});

test('split handles missing opening sentinel', t => {
  t.deepEqual(
    FrontMatter.split(`test: true
---
content`),
    {
      body: `test: true
---
content`,
    } as DocumentFormat
  );
});
