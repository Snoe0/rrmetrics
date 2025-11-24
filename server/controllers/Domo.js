const models = require('../models');

const { Domo } = models;

const makerPage = (req, res) => res.render('app');

const makeDomo = async (req, res) => {
  if (!req.body.name || !req.body.age) {
    return res.status(400).json({ error: 'Both name and age are required!' });
  }

  const domoData = {
    name: req.body.name,
    age: req.body.age,
    height: req.body.height,
    owner: req.session.account._id,
  };

  try {
    const newDomo = new Domo(domoData);
    await newDomo.save();
    return res.status(201).json({ name: newDomo.name, age: newDomo.age, height: newDomo.height });
  } catch (err) {
    console.log(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Domo already exists!' });
    }
    return res.status(500).json({ error: 'An error occurred' });
  }
};

const getDomos = async (req, res) => {
  try {
    const query = { owner: req.session.account._id };
    const docs = await Domo.find(query).select('name age height').lean().exec();

    return res.json({ domos: docs });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Error retrieving domos!' });
  }
};

const removeDomo = async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ error: 'Domo name is required to delete!' });
  }

  try {
    const query = {
      name: req.body.name,
      owner: req.session.account._id,
    };
    const deletedDomo = await Domo.findOneAndDelete(query).exec();

    if (!deletedDomo) {
      return res.status(404).json({ error: 'Domo not found!' });
    }

    return res.status(200).json({ message: 'Domo deleted successfully!' });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'An error occurred while deleting the domo!' });
  }
};

module.exports = {
  makerPage,
  makeDomo,
  getDomos,
  removeDomo,
};
