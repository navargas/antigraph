

try {
  s = `abc`;
  if (s !== 'abc')
    throw 'Template Literal';
} catch(e) {
  console.error(e);
  setCookie('unsupported', e.toString(), 1);
  window.location = '/';
}

