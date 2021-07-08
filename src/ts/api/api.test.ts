import {GenericApiError} from './api';
import test from 'ava';

test('GenericApiError properties', t => {
  const error = new GenericApiError('foo', {
    message: 'test',
  });

  t.is(error.message, 'foo');
  t.is(error.apiError.message, 'test');
});
