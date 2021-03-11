#!/usr/bin/env node

import express from 'express';

const PORT = 9090;

// App
const app = express();

app.get('/', function (req, res) {
  res.send('hello world')
})

app.listen(process.env.PORT || PORT, () => {
  console.log(`Running on port ${PORT}`);
  console.log(`Visit https://editor.dev/local/${PORT}/ to start editing.`);
});
