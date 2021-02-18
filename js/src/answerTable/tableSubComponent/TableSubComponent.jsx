import React, { useState, useEffect } from 'react';
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import {
  FaThList, FaFileCode,
} from 'react-icons/fa';
import { IoIosGitNetwork } from 'react-icons/io';
// import IoCodeWorking from 'react-icons/lib/io/code-working'

import './tableSubComponent.css';

import TableSubGraph from './subGraph/TableSubGraph';
import JsonView from './subJson/JsonView';
// import MetaDataView from './subMetaData/MetaDataView';

export const answersetSubComponentEnum = {
  graph: 1,
  json: 2,
  // metadata: 3,
};

export default function TableSubComponent(props) {
  const {
    data, store, activeButton, setActiveButton,
  } = props;
  const [nodeId, setNodeId] = useState(null);
  const [rowData, updateRowData] = useState({});
  const [graph, setGraph] = useState({});
  const [loadedGraph, setLoadedGraph] = useState(false);

  // Method that updates local mobx state with activeButton and nodeId based on props
  function syncPropsWithState() {
    if (nodeId) {
      setNodeId(nodeId);
    }
    const tempRowData = store.getDenseAnswer(data.id);
    const ansId = tempRowData.id;
    const g = store.activeAnswerGraph(ansId);

    setGraph(g);
    updateRowData(tempRowData);
    setLoadedGraph(true);
  }

  useEffect(() => {
    syncPropsWithState();
  }, []);

  const isJsonActive = activeButton === answersetSubComponentEnum.json;
  const isGraphActive = activeButton === answersetSubComponentEnum.graph;
  // const isMetadataActive = activeButton === answersetSubComponentEnum.metadata;
  return (
    <div id="tableSubComponentBackground">
      <div id="tableSubComponentContainer">
        <ButtonGroup
          orientation="vertical"
          variant="contained"
          className="tableSubComponentButtons"
        >
          <Button
            className={isJsonActive ? 'activeSubComponentButton' : ''}
            style={{ textAlign: 'left' }}
            onClick={() => setActiveButton(answersetSubComponentEnum.json)}
          >
            <span className="valign-center">
              <FaFileCode />
              <span style={{ paddingLeft: '5px' }}>JSON</span>
            </span>
          </Button>
          <Button
            className={isGraphActive ? 'activeSubComponentButton' : ''}
            style={{ textAlign: 'left' }}
            onClick={() => setActiveButton(answersetSubComponentEnum.graph)}
          >
            <div className="valign-center">
              <IoIosGitNetwork />
              <span style={{ paddingLeft: '5px' }}>Graph</span>
            </div>
          </Button>
          {/* <Button
            className={isMetadataActive ? 'activeSubComponentButton' : ''}
            style={{ textAlign: 'left' }}
            onClick={() => setActiveButton(answersetSubComponentEnum.metadata)}
          >
            <span className="valign-center">
              <FaThList />
              <span style={{ paddingLeft: '5px' }}>Metadata</span>
            </span>
          </Button> */}
        </ButtonGroup>
        {isJsonActive && (
          <JsonView
            rowData={rowData}
          />
        )}
        {isGraphActive && (
          <TableSubGraph
            loadedGraph={loadedGraph}
            store={store}
            graph={graph}
            activeAnswerId={rowData.id}
          />
        )}
        {/* {isMetadataActive && rowData.nodes && (
          <MetaDataView
            store={store}
            rowData={rowData.nodes}
          />
        )} */}
      </div>
    </div>
  );
}
