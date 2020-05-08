import React, { useState, useEffect, useMemo } from 'react';
import { FaAngleDown } from 'react-icons/fa';
import ClickAwayListener from '@material-ui/core/ClickAwayListener';
import Typography from '@material-ui/core/Typography';
import Popper from '@material-ui/core/Popper';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Slider from '@material-ui/core/Slider';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Tooltip from '@material-ui/core/Tooltip';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import CloseIcon from '@material-ui/icons/Close';
import CircularProgress from '@material-ui/core/CircularProgress';

import './subGraph.css';

import AnswerGraph from '../../../shared/Old_AnswerGraph';
import AnswerExplorerInfo from './AnswerExplorerInfo';

function SliderLabel(props) {
  const { children, open, value } = props;
  return (
    <Tooltip
      className="sliderTooltip"
      open={open}
      enterTouchDelay={0}
      placement="top"
      title={`${value} Nodes`}
    >
      {children}
    </Tooltip>
  );
}

export default function TableSubGraph(props) {
  const {
    store, loadedGraph, graph, activeAnswerId,
  } = props;
  const [hierarchical, toggleHierarchical] = useState(false);
  const [showModal, toggleModal] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);
  const [localPruneNum, updateLocalPruneNum] = useState(10);
  const [committedPruneNum, setCommittedPruneNum] = useState(10);
  const randomSeed = useMemo(() => Math.floor(Math.random() * 100));
  const [maxSliderVal, setMaxSliderVal] = useState(1);

  function onGraphClick(event) {
    if (event.edges.length !== 0) { // Clicked on an Edge
      setSelectedEdge(event.edgeObjects[0]);
      toggleModal(true);
    } else { // Reset things since something else was clicked
      setSelectedEdge(null);
      toggleModal(false);
    }
  }

  useEffect(() => {
    store.updateNumAgSetNodes(committedPruneNum);
  }, [committedPruneNum]);

  useEffect(() => {
    if (loadedGraph) {
      const maxSetNodes = store.getMaxNumAgNodes(activeAnswerId);
      setMaxSliderVal(maxSetNodes);
      setCommittedPruneNum(Math.min(maxSetNodes, committedPruneNum));
      updateLocalPruneNum(Math.min(maxSetNodes, localPruneNum));
    }
  }, [loadedGraph]);

  return (
    <div>
      {loadedGraph ? (
        <div>
          <AnswerGraph
            subgraph={graph}
            concepts={store.concepts}
            layoutRandomSeed={randomSeed}
            layoutStyle={hierarchical ? 'hierarchical' : ''}
            callbackOnGraphClick={onGraphClick}
            showSupport
            varyEdgeSmoothRoundness
            omitEdgeLabel={false}
            height={350}
          />
          <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
            <div className="graphPopover">
              <Button
                style={{
                  width: '100%', textAlign: 'center', cursor: 'pointer', padding: '10px',
                }}
                onClick={(e) => setAnchorEl(anchorEl ? null : e.target)}
                variant="contained"
              >
                Graph Options
                <FaAngleDown />
              </Button>
              <Popper
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
              >
                <div className="popoverDiv">
                  {maxSliderVal > 1 && (
                    <>
                      {maxSliderVal !== committedPruneNum ? (
                        `Pruned graph showing top ${committedPruneNum} set nodes`
                      ) : (
                        'Prune Set Nodes'
                      )}
                      <Slider
                        value={localPruneNum}
                        onChange={(e, v) => updateLocalPruneNum(v)}
                        onChangeCommitted={(e, v) => setCommittedPruneNum(v)}
                        min={1}
                        max={maxSliderVal}
                        ValueLabelComponent={SliderLabel}
                      />
                    </>
                  )}
                  <FormControlLabel
                    control={
                      <Checkbox checked={hierarchical} onChange={(e) => toggleHierarchical(e.target.checked)} />
                    }
                    label="Hierarchical"
                  />
                </div>
              </Popper>
            </div>
          </ClickAwayListener>
          <Dialog
            open={showModal}
            onClose={() => toggleModal(false)}
            maxWidth="lg"
            fullWidth
            aria-labelledby="AnswerExplorerModal"
          >
            <DialogTitle disableTypography>
              <Typography variant="h3">Edge Explorer</Typography>
              <IconButton aria-label="close" className="edgeExplorerCloseButton" onClick={() => toggleModal(false)}>
                <CloseIcon fontSize="large" />
              </IconButton>
            </DialogTitle>
            <AnswerExplorerInfo
              graph={graph}
              selectedEdge={selectedEdge}
              store={store}
            />
          </Dialog>
        </div>
      ) : (
        <div id="subGraphLoading">
          <CircularProgress size={100} thickness={5} />
        </div>
      )}
    </div>
  );
}
