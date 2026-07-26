const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Conecta a MongoDB Atlas
mongoose.connect('TU_CONNECTION_STRING_AQUI', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Atlas conectado'))
.catch(err => console.error('Error MongoDB:', err));

// Modelo de usuario
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
});
const User = mongoose.model('User', UserSchema);

// Registro
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const user = new User({ email, password });
  await user.save();
  res.send({ message: 'Usuario registrado' });
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (user) {
    res.send({ message: 'Login exitoso', user });
  } else {
    res.status(401).send({ message: 'Usuario o contraseña incorrectos' });
  }
});

app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));