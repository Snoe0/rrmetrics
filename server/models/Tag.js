const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  color: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: 'Account',
  },
});

TagSchema.index({ owner: 1, name: 1 }, { unique: true });

const TagModel = mongoose.model('Tag', TagSchema);
module.exports = TagModel;
