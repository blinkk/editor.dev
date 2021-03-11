import express from 'express';

const PORT = 9090;

// App
const app = express();

app.get('/', function (req, res) {
  res.send('hello live editor')
})

app.listen(process.env.PORT || PORT, () => {
  console.log(`Running on port ${PORT}`);
});
