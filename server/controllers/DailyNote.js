const models = require('../models');

const { DailyNote } = models;

const getNotes = async (req, res) => {
  try {
    const notes = await DailyNote.find({ owner: req.session.account._id }).lean().exec();
    return res.json({ notes });
  } catch (err) {
    console.error('Failed to fetch daily notes:', err);
    return res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

const saveNote = async (req, res) => {
  const { date, content } = req.body;
  if (!date || !content) {
    return res.status(400).json({ error: 'Date and content are required' });
  }

  try {
    const note = await DailyNote.findOneAndUpdate(
      { owner: req.session.account._id, date },
      { content },
      { upsert: true, new: true },
    ).exec();
    return res.json({ note });
  } catch (err) {
    console.error('Failed to save daily note:', err);
    return res.status(500).json({ error: 'Failed to save note' });
  }
};

const deleteNote = async (req, res) => {
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    await DailyNote.deleteOne({ owner: req.session.account._id, date }).exec();
    return res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('Failed to delete daily note:', err);
    return res.status(500).json({ error: 'Failed to delete note' });
  }
};

module.exports = {
  getNotes,
  saveNote,
  deleteNote,
};
