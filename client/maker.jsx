const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');

const handleDomo = (e, onDomoAdded) => {
  e.preventDefault();
  helper.hideError();

  const name = e.target.querySelector('#domoName').value;
  const age = e.target.querySelector('#domoAge').value;
  const height = e.target.querySelector('#domoFeet').value ? `${e.target.querySelector('#domoFeet').value}'${e.target.querySelector('#domoInches').value}"` : "N/A";

  if (!name || !age) {
    helper.handleError('Name and age are required');
    return false;
  }

  helper.sendPost(e.target.action, { name, age, height }, onDomoAdded);
  return false;
};

const handleRemoveDomo = (name, onDomoRemoved) => {
  helper.hideError();

  if (!name) {
    helper.handleError('Domo name is required to delete!');
    return false;
  }

  helper.sendPost('/removeDomo', { name }, onDomoRemoved);
  return false;
};

const DomoForm = (props) => {
  return (
    <form id="domoForm"
      onSubmit={(e) => handleDomo(e, props.triggerReload)}
      name="domoForm"
      action="/maker"
      method="POST"
      className="domoForm"
    >
      <label htmlFor="domoName">Name: </label>
      <input id="domoName" type="text" name="name" placeholder="Domo Name" />
      <label htmlFor="domoAge">Age: </label>
      <input id="domoAge" type="number" min="0" name="age" placeholder="Age" />
      <label htmlFor="domoFeet">Height: </label>
      <input id="domoFeet" type="number" name="height" min="0" placeholder="Feet" />
      <input id="domoInches" type="number" name="height2" min="0" max="11" placeholder="Inches" />
      <input className="makeDomoSubmit" type="submit" value="Make Domo" />
    </form>
  );
};

const DomoList = (props) => {
  const [domos, setDomos] = useState(props.domos);

  useEffect(() => { 
    const loadDomosFromServer = async () => {
      const response = await fetch('/getDomos');
      const data = await response.json();
      setDomos(data.domos);
    };
    loadDomosFromServer();
  }, [props.reloadDomos]);

  if (domos.length === 0) {
    return (
      <div className="domoList">
        <h3 className="emptyDomo">No Domos yet</h3>
      </div>
    );
  }

  const domoNodes = domos.map(domo => {
    return (
      <div key={domo.id} className="domo">
        <img src="/assets/img/domoface.jpeg" alt="domo face" className="domoFace" />
        <h3 className="domoName">Name: {domo.name}</h3>
        <img
          src="/assets/img/trash.png" alt="delete domo" className="domoDelete"  onClick={() => handleRemoveDomo(domo.name, props.triggerReload)}
        />
        <h3 className="domoHeight">Height: {domo.height}</h3>
        <h3 className="domoAge">Age: {domo.age}</h3>
      </div>
    );
  });

  return (
    <div className="domoList">
      {domoNodes}
    </div>
  );
};

const App = () => {
  const [reloadDomos, setReloadDomos] = useState(false);

  return (
    <div>
      <div id="makeDomo">
        <DomoForm triggerReload={() => setReloadDomos(!reloadDomos)} />
      </div>
      <div id="domos">
        <DomoList domos={[]} reloadDomos={reloadDomos} triggerReload={() => setReloadDomos(!reloadDomos)} />
        </div>
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('app'));
  root.render(<App />);
};

window.onload = init;

