const models = require('../models');

const { Tag, Trade } = models;

const getTags = async (req, res) => {
  try {
    const docs = await Tag.find({ owner: req.session.account._id })
      .sort({ name: 1 })
      .lean()
      .exec();
    return res.json({ tags: docs });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Error retrieving tags!' });
  }
};

const makeTag = async (req, res) => {
  if (!req.body.name || !req.body.color) {
    return res.status(400).json({ error: 'Name and color are required!' });
  }

  try {
    const newTag = new Tag({
      name: req.body.name.trim(),
      color: req.body.color,
      owner: req.session.account._id,
    });
    await newTag.save();
    return res.status(201).json({
      _id: newTag._id,
      name: newTag.name,
      color: newTag.color,
    });
  } catch (err) {
    console.log(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A tag with that name already exists!' });
    }
    return res.status(500).json({ error: 'An error occurred' });
  }
};

const updateTag = async (req, res) => {
  if (!req.body._id) {
    return res.status(400).json({ error: 'Tag ID is required!' });
  }

  try {
    const updateData = {};
    if (req.body.name) updateData.name = req.body.name.trim();
    if (req.body.color) updateData.color = req.body.color;

    const updatedTag = await Tag.findOneAndUpdate(
      { _id: req.body._id, owner: req.session.account._id },
      updateData,
      { new: true, runValidators: true },
    ).exec();

    if (!updatedTag) {
      return res.status(404).json({ error: 'Tag not found!' });
    }

    return res.status(200).json({
      _id: updatedTag._id,
      name: updatedTag.name,
      color: updatedTag.color,
    });
  } catch (err) {
    console.log(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A tag with that name already exists!' });
    }
    return res.status(500).json({ error: 'An error occurred while updating the tag!' });
  }
};

const removeTag = async (req, res) => {
  if (!req.body._id) {
    return res.status(400).json({ error: 'Tag ID is required to delete!' });
  }

  try {
    const deletedTag = await Tag.findOneAndDelete({
      _id: req.body._id,
      owner: req.session.account._id,
    }).exec();

    if (!deletedTag) {
      return res.status(404).json({ error: 'Tag not found!' });
    }

    await Trade.updateMany(
      { tags: req.body._id },
      { $pull: { tags: req.body._id } },
    ).exec();

    return res.status(200).json({ message: 'Tag deleted successfully!' });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'An error occurred while deleting the tag!' });
  }
};

module.exports = {
  getTags,
  makeTag,
  updateTag,
  removeTag,
};
