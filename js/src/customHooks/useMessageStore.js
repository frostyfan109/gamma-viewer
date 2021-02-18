/* eslint-disable no-param-reassign */
import { useState, useRef } from 'react';
import _ from 'lodash';

import strings from '../../utils/stringUtils';

const makeEmptyArray = (len, init) => {
  const array = new Array(len);
  for (let i = 0; i < len; i += 1) array[i] = init;
  return array;
};

export default function useMessageStore() {
  const [message, setMessage] = useState({});
  const filter = useRef({});
  const [numAgSetNodes, updateNumAgSetNodes] = useState(10);
  const [idToIndexMaps, setIdToIndexMaps] = useState(null);
  const [filterKeys, setFilterKeys] = useState({});
  const [searchedFilter, updateSearchedFilter] = useState({});
  const [filteredAnswers, setFilteredAnswers] = useState([]);
  const [answers, setAnswers] = useState([]);

  const keyBlocklist = ['isSet', 'labels', 'equivalent_identifiers', 'category', 'id', 'degree', 'synonyms', 'attributes'];

  function makeIdToIndexMap(arr) {
    const idToIndexMap = new Map();
    arr.forEach((t, i) => idToIndexMap.set(t.id, i));
    return idToIndexMap;
  }

  function initializeMessage(msg) {
    msg.results.forEach((result, i) => {
      if (!result.id) {
        result.id = i;
      }
    });
    const kgNodeMap = makeIdToIndexMap(msg.knowledge_graph.nodes);
    const kgEdgeMap = makeIdToIndexMap(msg.knowledge_graph.edges);
    const qgNodeMap = makeIdToIndexMap(msg.query_graph.nodes);
    const qgEdgeMap = makeIdToIndexMap(msg.query_graph.edges);
    msg.query_graph.nodes.forEach((node) => {
      if (!node.category && node.curie) {
        // if no node category, go look up in knowledge graph
        const kgNodeInd = kgNodeMap.get(node.curie);
        // TODO: don't just grab the first category from the array
        [node.category] = msg.knowledge_graph.nodes[kgNodeInd].category;
      }
    });
    setIdToIndexMaps({
      kgNodeMap, kgEdgeMap, qgNodeMap, qgEdgeMap,
    });
    setMessage(msg);
  }

  function ansIdToIndMap() {
    const indMap = new Map();
    if (message.results) {
      message.results.forEach((ans, i) => indMap.set(ans.id, i));
    }
    return indMap;
  }

  /**
   * Number of graph nodes
   * @param {object} graph graph from message
   * @returns {int} number of nodes in graph
   */
  function getNumNodes(graph) {
    return message && message[graph] ? message[graph].nodes.length : 0;
  }
  function getNumKgNodes() {
    return getNumNodes('knowledge_graph');
  }
  function getNumQgNodes() {
    return getNumNodes('query_graph');
  }
  function getGraphEdge(graph, edgeId) {
    return graph.edges.find((edge) => edge.id === edgeId);
  }

  function getQNodeIds() {
    const qNodeIds = [];
    message.query_graph.nodes.forEach((n) => {
      qNodeIds.push(n.id);
    });
    return qNodeIds;
  }
  function getQEdgeIds() {
    const qEdgeIds = [];
    message.query_graph.edges.forEach((e) => {
      qEdgeIds.push(e.id);
    });
    return qEdgeIds;
  }

  function getQgNode(id) {
    return message.query_graph.nodes[idToIndexMaps.qgNodeMap.get(id)];
  }

  function getKgNode(nodeId) {
    return message.knowledge_graph.nodes[idToIndexMaps.kgNodeMap.get(nodeId)];
  }

  function getQgNodeInd(qgId) {
    return idToIndexMaps.qgNodeMap.get(qgId);
  }

  function annotatedPrunedKnowledgeGraph(pruneNum) {
    if (!message.query_graph) return {};
    // KG nodes don't always have category
    // If they don't we need to figure out which qNodes they most like correspond to
    // Then check labels and use the corresponding category

    const { results, knowledge_graph: kg, query_graph: qg } = message;
    const Nj = Math.round(pruneNum / getNumQgNodes());

    // Create a map between qGraph index to node id (for scoreVector)
    const qgNodeIndToIdMap = {};
    qg.nodes.forEach((node, i) => {
      qgNodeIndToIdMap[i] = node.id;
    });

    // Object map mapping qNodeId to Array of Objects of score info
    // of format { scoreVector, aggScore, kGNodeId }
    // eg: {"node01": [{ scoreVector, aggScore, id }, ...], "node02": [{ scoreVector, aggScore, id }, ...]}
    const qgNodeIdToScoreObjArrMap = {};
    idToIndexMaps.qgNodeMap.forEach((qNodeInd, qNodeId) => (qgNodeIdToScoreObjArrMap[qNodeId] = []));

    const qgNodeIdToCountMap = {};
    idToIndexMaps.qgNodeMap.forEach((qNodeInd, qNodeId) => (qgNodeIdToCountMap[qNodeId] = []));

    // Iterate through each node in knowledgeGraph and score them
    kg.nodes.forEach((node) => {
      const kgNode = _.cloneDeep(node);
      kgNode.scoreVector = makeEmptyArray(getNumQgNodes(), 0);
      kgNode.count = makeEmptyArray(getNumQgNodes(), 0);
      // Iterate through each answer
      results.forEach((ans) => {
        const { node_bindings: nodeBindings } = ans;
        // Iterate through each node_binding in an answer and if the KG node matches any, update score
        nodeBindings.forEach((nodeBinding) => {
          if (Array.isArray(nodeBinding.kg_id)) {
            const ind = nodeBinding.kg_id.indexOf(kgNode.id);
            if (ind > -1) {
              // set kg node level for heirarchical graph
              node.level = getQgNodeInd(nodeBinding.qg_id);
              kgNode.count[getQgNodeInd(nodeBinding.qg_id)] += 1;
              if (ans.score !== undefined) {
                kgNode.scoreVector[getQgNodeInd(nodeBinding.qg_id)] += ans.score;
              }
            }
          } else if (nodeBinding.kg_id === kgNode.id) {
            // set kg node level for heirarchical graph
            node.level = getQgNodeInd(nodeBinding.qg_id);
            kgNode.count[getQgNodeInd(nodeBinding.qg_id)] += 1;
            if (ans.score !== undefined) {
              kgNode.scoreVector[getQgNodeInd(nodeBinding.qg_id)] += ans.score;
            }
          }
          // Update score for qNode position in scoreVector since this kGNode was
          // referenced in this answer
          // sometimes results don't have scores
        });
      });
      kgNode.aggScore = kgNode.scoreVector.reduce((a, b) => a + b, 0);
      // Update qgNodeIdToScoreObjArrMap with this node for any non-zero
      // qNodeScore (Meaning that this node was referenced one or more times by
      // the corresponding qNode for qNodeInd)
      kgNode.scoreVector.forEach((qNodeScore, qNodeInd) => {
        if (qNodeScore > 0) {
          qgNodeIdToScoreObjArrMap[qgNodeIndToIdMap[qNodeInd]].push({
            scoreVector: kgNode.scoreVector, aggScore: kgNode.aggScore, id: kgNode.id,
          });
        }
      });
      kgNode.count.forEach((count, qNodeInd) => {
        if (count > 0) {
          qgNodeIdToCountMap[qgNodeIndToIdMap[qNodeInd]].push({
            count, id: kgNode.id,
          });
        }
      });
    });

    let rankedQgNodeMap = qgNodeIdToScoreObjArrMap;
    let hasScores = true;
    Object.values(qgNodeIdToScoreObjArrMap).forEach((arr) => {
      if (!arr.length) {
        hasScores = false;
      }
    });
    if (!hasScores) {
      rankedQgNodeMap = qgNodeIdToCountMap;
    }

    // Now sort for each qNode, by aggScore and retain a max of Nj nodes for each qNodeId
    // let extraNumNodes = 0; // Increment if any qNodeId utilizes less than Nj nodes
    let unselectedScoreObjArrMap = []; // Array of { scoreVector, aggScore, kGNodeId } objects that were not selected
    Object.keys(rankedQgNodeMap).forEach((qGraphNodeId) => {
      rankedQgNodeMap[qGraphNodeId] = _.uniqBy(rankedQgNodeMap[qGraphNodeId], (el) => el.id); // Remove dup nodes
      rankedQgNodeMap[qGraphNodeId] = _.reverse(_.sortBy(rankedQgNodeMap[qGraphNodeId], (el) => el.aggScore || el.count));
      const numQGraphNodes = rankedQgNodeMap[qGraphNodeId].length;
      if (numQGraphNodes < Nj) {
      //  extraNumNodes += Nj - numQGraphNodes;
      } else {
        unselectedScoreObjArrMap = unselectedScoreObjArrMap.concat(rankedQgNodeMap[qGraphNodeId].slice(Nj));
        rankedQgNodeMap[qGraphNodeId] = rankedQgNodeMap[qGraphNodeId].slice(0, Nj);
      }
    });

    // Construct list of all nodeIds for final pruned knowledgeGraph
    let prunedKGNodeIds = [];
    Object.keys(rankedQgNodeMap).forEach((qGraphNodeId) => {
      rankedQgNodeMap[qGraphNodeId].forEach((scoreObj) => prunedKGNodeIds.push(scoreObj.id));
    });
    const numExtraNodesToGrab = pruneNum - prunedKGNodeIds.length;
    // If extraNodes available to be populated, sort unselectedScoreObjArrMap and
    // pick max remaining nodes to pick and add their ids to selectedNodeIdSet
    // TODO: This step can result in all extra nodes from a single qNode that has high AggScore (eg node6 in message_test.json)
    if (numExtraNodesToGrab > 0) {
      unselectedScoreObjArrMap = _.uniqBy(unselectedScoreObjArrMap, (el) => el.id);
      unselectedScoreObjArrMap = _.reverse(_.sortBy(unselectedScoreObjArrMap, (el) => el.aggScore));
      prunedKGNodeIds = prunedKGNodeIds.concat(unselectedScoreObjArrMap.slice(0, numExtraNodesToGrab).map((el) => el.id));
    }

    // Construct prunedKgNodeList
    const prunedKgNodeList = prunedKGNodeIds.map((kgNodeId) => kg.nodes[idToIndexMaps.kgNodeMap.get(kgNodeId)]);
    const prunedKgNodeIdSet = new Set(prunedKgNodeList.map((node) => node.id));
    // Construct pruned edges from original KG-graph
    const prunedKgEdgeList = kg.edges.filter((edge) => {
      if (prunedKgNodeIdSet.has(edge.subject) && prunedKgNodeIdSet.has(edge.object)) {
        return true;
      }
      return false;
    });

    const prunedGraph = {
      nodes: prunedKgNodeList,
      edges: prunedKgEdgeList,
    };

    // Now set correct category for nodes by going through answers and
    // allowing for majority vote across all answers for the category
    const qNodes = qg.nodes;
    const qNodeBindings = qNodes.map((q) => q.id);

    prunedGraph.nodes.forEach((node) => {
      if ((('category' in node) && Array.isArray(node.category)) || (!('category' in node) && ('labels' in node))) {
        // if a prunedGraph node doesn't have a category
        // We will look through all answers
        // We will count the number of times is used in each qNode
        // Then take the max to pick the best one
        // The category is then the category of that qNode
        const qNodeCounts = qNodeBindings.map(() => 0);

        results.forEach((a) => {
          // Go through answers and look for this node
          a.node_bindings.forEach((nodeBinding) => {
            const theseIds = nodeBinding.kg_id;
            if (Array.isArray(theseIds)) {
              // This answer has a set of nodes for this binding
              if (theseIds.includes(node.id)) {
                // The set contains this id
                qNodeCounts[qNodeBindings.indexOf(nodeBinding.qg_id)] += 1;
              }
            } else if (theseIds === node.id) {
              // This answer lists this node as qNode: key
              qNodeCounts[qNodeBindings.indexOf(nodeBinding.qg_id)] += 1;
            }
          });
        });
        // See what question node this was mapped to most
        const maxCounts = qNodeCounts.reduce((m, val) => Math.max(m, val));
        const qNodeIndex = qNodeCounts.indexOf(maxCounts);

        // Use that numQgNodes Nodes Category
        node.category = qNodes[qNodeIndex].category;
        if (node.category === 'named_thing') { // we don't actually want any named_things
          let kgNodeCategory = getKgNode(node.id).category;
          if (!Array.isArray(kgNodeCategory)) { // so the category will always be an array
            kgNodeCategory = [kgNodeCategory];
          }
          node.category = kgNodeCategory;
        }
      }
    });

    return prunedGraph;
  }

  // Returns formatted answerset data for tabular display
  // {
  //   answers: [{ nodes: {n0: {name: , id: , category: , isSet, setNodes?: }, n1: {}, ...}, score: -1 }, {}, ...],
  //   columnHeaders: [{ Header: 'n01: Gene', id: 'n01', isSet: false, category: 'gene'}, {}, ...],
  // }
  function answerSetTableData() {
    const columnHeaders = [];
    const tempAnswers = [];
    let unknownNodes = false;
    // set the column headers object
    message.query_graph.nodes.forEach((n) => {
      // TODO: handle an array of categories
      let { category } = n;
      if (Array.isArray(category)) { // just grab first category
        [category] = category;
      }
      columnHeaders.push({
        Header: `${n.id}: ${strings.displayCategory(category)}`,
        id: n.id,
        isSet: n.is_set,
        category,
      });
    });
    // get the names and score from each answer for the table
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      const answer = {};
      nodeBindings.forEach((nodeBinding) => {
        const qnodeId = nodeBinding.qg_id;
        answer[qnodeId] = [];
        if (!Array.isArray(nodeBinding.kg_id)) {
          nodeBinding.kg_id = [nodeBinding.kg_id];
        }
        nodeBinding.kg_id.forEach((knodeId) => {
          const kNode = getKgNode(knodeId);
          if (kNode) {
            answer[qnodeId].push({
              name: kNode.name,
              id: kNode.id,
            });
          } else {
            answer[qnodeId].push({
              name: 'Missing Node',
            });
            unknownNodes = true;
          }
        });
      });
      answer.score = ans.score;
      answer.id = ans.id;
      tempAnswers.push(answer);
    });
    setFilteredAnswers(tempAnswers);
    setAnswers(tempAnswers);
    return { columnHeaders, unknownNodes };
  }

  // builds dense answer
  function getDenseAnswer(answerId) {
    const qNodeIds = getQNodeIds();
    const qEdgeIds = getQEdgeIds();
    const kg = message.knowledge_graph;
    const { kgEdgeMap } = idToIndexMaps;
    const answer = message.results[answerId];
    const ansObj = {
      score: answer.score, nodes: {}, edges: {}, id: answer.id,
    };
    qNodeIds.forEach((qNodeId) => {
      const qNode = getQgNode(qNodeId);
      let nodeListObj = { category: qNode.category, isSet: false };
      const kgNodeIds = answer.node_bindings.find((ans) => ans.qg_id === qNodeId).kg_id;
      if (!Array.isArray(kgNodeIds)) {
        // This is not a set node
        if (('is_set' in qNode) && qNode.is_set) {
          // Actually a set but only has one element
          nodeListObj = { category: qNode.category, name: `Set: ${strings.displayCategory(qNode.category)}`, isSet: true };
          nodeListObj.setNodes = [kgNodeIds].map((kgNodeId) => getKgNode(kgNodeId));
        } else {
          // for real, not a set
          nodeListObj = { ...getKgNode(kgNodeIds), ...nodeListObj };
        }
      } else if ((kgNodeIds.length === 1) && !qNode.is_set) {
        // This is not a set node but, for some reason is an array

        nodeListObj = { ...getKgNode(kgNodeIds[0]), ...nodeListObj };
      } else {
        // Set
        nodeListObj = { category: qNode.category, name: `Set: ${strings.displayCategory(qNode.category)}`, isSet: true };
        nodeListObj.setNodes = kgNodeIds.map((kgNodeId) => getKgNode(kgNodeId));
      }
      ansObj.nodes[qNodeId] = nodeListObj;
    });
    qEdgeIds.forEach((qEdgeId) => {
      let cEdgeIds = [];
      const edge = answer.edge_bindings.find((e) => e.qg_id === qEdgeId);
      if (!Array.isArray(edge.kg_id)) { // Just a single id
        cEdgeIds = [edge.kg_id];
      } else { // we already have an array.
        cEdgeIds = edge.kg_id;
      }
      ansObj.edges[qEdgeId] = cEdgeIds.map((eid) => kg.edges[kgEdgeMap.get(eid)]);
    });

    return ansObj;
  }

  // Returns subgraphViewer compatible format graph spec { nodes: {}, edges: {} }
  function activeAnswerGraph(activeAnswerId) {
    const ansIdMap = ansIdToIndMap();
    const answer = message.results[ansIdMap.get(activeAnswerId)];
    const graph = { nodes: [], edges: [] };

    // We could loop through the qNodes to find out what nodes are in this answer
    // But there might be extra nodes or edges in this answer
    // This happens with literature edges, they aren't in qgraph but they are in answers
    const nodeBindingsMap = new Map(answer.node_bindings.map((n) => [n.qg_id, n.kg_id]));
    // So we loop through the keys in node_bindings
    nodeBindingsMap.forEach((val, keyId) => {
      const newNodes = [];
      const qNode = getQgNode(keyId);
      const nodeIds = val;
      let nodes = [];
      let isSet = true;

      if (!qNode.is_set) {
        // if the node is not a set but is still an array
        const nodeId = Array.isArray(nodeIds) ? nodeIds[0] : nodeIds;
        nodes = [{ id: nodeId }];
        isSet = false;
        // Node is not a set
        // We will make it an array so we can follow the same code path
      } else { // we need to prune the set nodes down to a managable number
        nodeIds.forEach((nodeId) => {
          const node = { id: nodeId };
          let score = 0;
          message.knowledge_graph.edges.forEach((edge) => {
            if ((nodeId === edge.subject || nodeId === edge.object) && Array.isArray(edge.publications)) {
              score += edge.publications.length;
            }
          });
          node.score = score;
          nodes.push(node);
        });
        nodes = _.reverse(_.sortBy(nodes, (n) => n.score));
        nodes = nodes.splice(0, numAgSetNodes);
      }
      nodes.forEach((node) => {
        let kgNode = getKgNode(node.id);
        // Get the category from the qNode
        if (kgNode) {
          kgNode = _.cloneDeep(kgNode);
          kgNode.category = qNode.category;
          kgNode.isSet = isSet;
          kgNode.binding = keyId;
          // level is needed for hierarchical view
          kgNode.level = idToIndexMaps.qgNodeMap.get(keyId);
          newNodes.push(kgNode);
        }
      });
      newNodes.forEach((n) => graph.nodes.push(n));
    });

    const prunedAgNodeIdSet = new Set(graph.nodes.map(((n) => n.id)));

    const edgeBindingsMap = new Map(answer.edge_bindings.map((e) => [e.qg_id, e.kg_id]));

    // Construct pruned edges
    edgeBindingsMap.forEach((kedgeIds, qedgeId) => {
      const newEdges = [];
      let edgeIds = kedgeIds;
      if (!Array.isArray(edgeIds)) {
        edgeIds = [edgeIds];
      }
      edgeIds.forEach((eId) => {
        // get kedge details
        let kgEdge = getGraphEdge(message.knowledge_graph, eId);
        // check that kedge is not pruned away
        if (kgEdge && prunedAgNodeIdSet.has(kgEdge.subject) && prunedAgNodeIdSet.has(kgEdge.object)) {
          kgEdge = _.cloneDeep(kgEdge);
          kgEdge.binding = qedgeId;
          // add to newEdges
          newEdges.push(kgEdge);
        }
      });
      newEdges.forEach((e) => graph.edges.push(e));
    });

    return graph;
  }

  function getMaxNumAgNodes(activeAnswerId) {
    if (activeAnswerId === undefined) {
      return getNumKgNodes();
    }
    const ansIdMap = ansIdToIndMap();
    const result = message.results[ansIdMap.get(activeAnswerId)];
    const nodeBindingsMap = result.node_bindings.map((n) => n.kg_id);
    let maxNumAgNodes = 0;
    nodeBindingsMap.forEach((val) => {
      const nodeIds = val;
      if (Array.isArray(nodeIds)) {
        maxNumAgNodes = Math.max(maxNumAgNodes, nodeIds.length);
      }
    });
    return maxNumAgNodes;
  }

  // Determines if annotatedPrunedKnowledgeGraph had to prune KG
  function isKgPruned(ansId) {
    if (message.knowledge_graph) {
      return getMaxNumAgNodes(ansId) > getNumKgNodes();
    }
    return false;
  }

  function isAgPruned(ansId) {
    return numAgSetNodes < getMaxNumAgNodes(ansId);
  }

  function getSetNodes(answerId, nodeId) {
    const setNodeIds = message.results[answerId].node_bindings.find((node_binding) => node_binding.qg_id === nodeId).kg_id;
    const setNodes = setNodeIds.map((id) => getKgNode(id));
    return setNodes;
  }

  /**
   * get only keys that show up in every single answer
   * @returns {{n0:{name:{Ebola:[true,true]}},n1:{name:{LINS1:[true,true]}}}}
   */
  function initializeFilterKeys() {
    // the arrays are [checked, available given other columns]
    const tempFilterKeys = {};
    const qgNodeIds = getQNodeIds();
    qgNodeIds.forEach((qnodeId) => {
      tempFilterKeys[qnodeId] = {};
      const qnodeFilter = tempFilterKeys[qnodeId];
      Object.keys(filter.current[qnodeId]).forEach((knodeId) => {
        const knode = getKgNode(knodeId);
        if (knode) {
          if (Object.keys(qnodeFilter).length === 0) {
            // we are dealing with the first node
            Object.keys(knode).forEach((propertyKey) => {
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (!keyBlocklist.includes(propertyKey)) {
                qnodeFilter[propertyKey] = {};
                qnodeFilter[propertyKey][knode[propertyKey]] = [true, true];
              }
            });
          } else {
            // we are adding a node to the existing tempFilterKeys
            Object.keys(knode).forEach((propertyKey) => {
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (!keyBlocklist.includes(propertyKey) && qnodeFilter[propertyKey]) {
                qnodeFilter[propertyKey][knode[propertyKey]] = [true, true];
              }
            });
          }
          Object.keys(qnodeFilter).forEach((propertyKey) => {
            if (!Object.keys(knode).includes(propertyKey)) {
              delete qnodeFilter[propertyKey];
            }
          });
        }
      });
    });
    setFilterKeys(tempFilterKeys);
    updateSearchedFilter(tempFilterKeys);
  }

  /**
   * Makes simple filter object
   * {{n0:{"MONDO:0005737":true},n1:{"LINS1":true}}}
   */
  function initializeFilter() {
    const qNodeIds = getQNodeIds();
    qNodeIds.forEach((id) => {
      filter.current[id] = {};
    });
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      nodeBindings.forEach((nodeBinding) => {
        if (Array.isArray(nodeBinding.kg_id)) {
          nodeBinding.kg_id.forEach((kgNodeId) => {
            filter.current[nodeBinding.qg_id][kgNodeId] = true;
          });
        } else {
          filter.current[nodeBinding.qg_id][nodeBinding.kg_id] = true;
        }
      });
    });
    initializeFilterKeys();
  }

  /**
   * Update filterKeys object based on filter and table filtered answers
   */
  function updateFilteredAnswers(newFilteredAnswers) {
    const newFilterKeys = _.cloneDeep(filterKeys);
    const qgNodeIds = getQNodeIds();
    qgNodeIds.forEach((qnodeId) => {
      const qnodeFilter = newFilterKeys[qnodeId];
      Object.keys(qnodeFilter).forEach((propertyKey) => {
        Object.keys(qnodeFilter[propertyKey]).forEach((propertyValue) => {
          qnodeFilter[propertyKey][propertyValue][1] = false;
        });
      });
    });

    newFilteredAnswers.forEach((answer) => { // loop over rows (remaining answers)
      qgNodeIds.forEach((qnodeId) => { // loop over columns (qnodes)
        answer[qnodeId].forEach((knode) => { // loop over knodes
          if (filter.current[qnodeId][knode.id]) {
            knode = getKgNode(knode.id);
            Object.keys(knode).forEach((propertyKey) => { // loop over properties belonging to knode
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (propertyKey in newFilterKeys[qnodeId]) {
                newFilterKeys[qnodeId][propertyKey][knode[propertyKey]][1] = true;
              }
            });
          }
        });
      });
    });
    setFilterKeys(newFilterKeys);
    setFilteredAnswers(newFilteredAnswers);
  }

  /**
   * Update react table based on filter object
   * @returns Filtered rows
   */
  function defaultFilter() {
    const qgNodeIds = getQNodeIds();
    const filteredResults = answers.filter((row) => {
      const remove = qgNodeIds.find((qnodeId) => {
        const found = row[qnodeId].find((knode) => knode.id && !filter.current[qnodeId][knode.id]);
        if (found) {
          // if found, we want to remove
          return true;
        }
        return false;
      });
      if (remove) {
        // if we want to remove, filter out
        return false;
      }
      return true;
    });
    updateFilteredAnswers(filteredResults);
    // return filteredResults;
  }

  /**
   * Update filter object given the filterKeys object
   */
  function updateFilter(newFilterKeys) {
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      nodeBindings.forEach((nodeBinding) => {
        let knodeIds = nodeBinding.kg_id;
        const { qg_id } = nodeBinding;
        if (!Array.isArray(knodeIds)) {
          knodeIds = [knodeIds];
        }
        const qnodeFilter = newFilterKeys[qg_id];
        let show;
        knodeIds.forEach((knodeId) => {
          const knode = getKgNode(knodeId);
          if (knode) {
            show = !Object.keys(qnodeFilter).some((propertyKey) => !qnodeFilter[propertyKey][knode[propertyKey]][0]);
            filter.current[qg_id][knodeId] = show;
          }
        });
      });
    });

    defaultFilter();
  }

  /**
   * Given a value and nodeId, either check or uncheck it
   */
  function updateFilterKeys(qnodeId, propertyKey, propertyValue) {
    const oldValue = filterKeys[qnodeId][propertyKey][propertyValue][0];
    filterKeys[qnodeId][propertyKey][propertyValue][0] = !oldValue;
    const newFilterKeys = _.cloneDeep(filterKeys);
    setFilterKeys(newFilterKeys);
    updateFilter(newFilterKeys);
  }

  function searchFilter(qnodeId, value) {
    // we need to make a complete copy of filterKeys
    const tempSearchedFilter = _.cloneDeep(filterKeys);
    Object.keys(filterKeys[qnodeId]).forEach((propertyKey) => {
      Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
        // if the property value doesn't include the search term, delete it from the searched filter
        if (!propertyValue.toLowerCase().includes(value.toLowerCase())) {
          delete tempSearchedFilter[qnodeId][propertyKey][propertyValue];
        }
      });
    });
    updateSearchedFilter(tempSearchedFilter);
  }

  /**
   * Reset the filter and filterKeys objects back to all trues
   */
  function reset(qnodeId) {
    Object.keys(filterKeys[qnodeId]).forEach((propertyKey) => {
      Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
        filterKeys[qnodeId][propertyKey][propertyValue][0] = true;
      });
    });
    const newFilterKeys = _.cloneDeep(filterKeys);
    updateSearchedFilter(newFilterKeys);
    setFilterKeys(newFilterKeys);
    updateFilter(newFilterKeys);
  }

  /**
   * Return boolean of if any properties are checked
   * @returns Boolean
   */
  function isPropFiltered(propertyKey) {
    let filtered = false;
    filtered = Object.keys(propertyKey).some((propertyValue) => !propertyKey[propertyValue][0]);
    return filtered;
  }

  /**
   * Check whether any properties are checked and either check or uncheck all
   */
  function checkAll(qnodeId, propertyKey) {
    const check = isPropFiltered(filterKeys[qnodeId][propertyKey]);
    Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
      filterKeys[qnodeId][propertyKey][propertyValue][0] = check;
    });
    const newFilterKeys = _.cloneDeep(filterKeys);
    setFilterKeys(newFilterKeys);
    updateFilter(newFilterKeys);
  }

  /**
   * Check to see if whole column filter has any false values
   * @returns Boolean
   */
  function isFiltered(qnodeId) {
    let filtered = false;
    if (filterKeys[qnodeId]) {
      // goes through the filterkeys until it finds one that is false
      filtered = Object.keys(filterKeys[qnodeId]).some((propertyKey) => (
        Object.keys(filterKeys[qnodeId][propertyKey]).some((propertyValue) => (
          !filterKeys[qnodeId][propertyKey][propertyValue][0]))
      ));
    }
    return filtered;
  }

  return {
    message,
    initializeMessage,
    annotatedPrunedKnowledgeGraph,
    numKgNodes: getNumKgNodes(),
    numQgNodes: getNumQgNodes(),
    answerSetTableData,
    getDenseAnswer,
    activeAnswerGraph,
    updateNumAgSetNodes,
    numAgSetNodes,
    getMaxNumAgNodes,
    getSetNodes,
    isKgPruned,
    isAgPruned,
    filterKeys,
    initializeFilter,
    updateFilterKeys,
    searchFilter,
    reset,
    defaultFilter,
    checkAll,
    isFiltered,
    updateFilteredAnswers,
    searchedFilter,
    filteredAnswers,
    isPropFiltered,
  };
}
