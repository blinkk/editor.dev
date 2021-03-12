import express from 'express';

const PORT = process.env.PORT || 9090;

// App
const app = express();

app.get('/', (req, res) => {
  res.send('hello live editor');
});

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
