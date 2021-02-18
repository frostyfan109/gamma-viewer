// Check out https://html-color.codes to pick new colors
// This is hard to have this many contrasting colors that are within families leave text readable.
// This should be periodically updated as new node categories are introduced to give them consistent colors
const undefinedColor = '#cccccc';

const conceptColorMap = {
  'biolink:AnatomicalEntity': '#e5d8bd', // Brown
  'biolink:BiologicalEntity': '#c1a25a', // Darker Brown
  'biolink:BiologicalProcess': '#b3cde3', // Blue
  'biolink:BiologicalProcessOrActivity': '#b3cde3', // same as biological_process
  'biolink:Cell': '#fddaec', // Pink
  'biolink:CellularComponent': '#ead6e0', // Gray-Pink
  'biolink:ChemicalSubstance': '#8787ff', // Blue
  'biolink:ChemicalExposure': '#126180', // Blue Sapphire
  'biolink:Disease': '#fbb4ae', // Red
  'biolink:DiseaseOrPhenotypicFeature': '#fbb4ae', // Red, same as disease
  'biolink:Drug': '#8787ff', // Purply blue, same as chemical_substance
  'biolink:Protein': '#ccebc5', // Green like gene
  'biolink:EnvironmentalFeature': '#8a9a5b', // Moss Green
  'biolink:Food': '#ffa343', // Neon Carrot
  'biolink:Gene': '#ccebc5', // Green
  'biolink:GeneFamily': '#68c357', // Darker Green
  'biolink:GeneticCondition': '#ffffcc', // Yellow
  'biolink:GrossAnatomicalStructure': '#f1ebe0', // Lighter brown to go with anatomical_entity
  'biolink:LifeStage': '#fe4164', // Neon Fuchsia
  'biolink:MolecularFunction': '#fed9a6', // Orange
  'biolink:MolecularEntity': '#a6a6d9', // Gray Purple
  'biolink:MolecularActivity': '#bae2d1', // Green Cyan
  'biolink:Metabolite': '#cad2b2', // Yellow Green
  'biolink:OrganismTaxon': '#00b7eb', // Cyan
  'biolink:Pathway': '#decbe4', // Purple
  'biolink:PhenotypicFeature': '#f56657', // Darker red, to go with disease
  'biolink:PopulationOfIndividualOrganisms': '#dde26a', // Bored Accent Green
  'biolink:SequenceVariant': '#00c4e6', // Light teal'
};

export default function getNodeCategoryColorMap(categories) {
  return (category) => {
    let color = undefinedColor;

    if (category in conceptColorMap) {
      color = conceptColorMap[category];
    } else if (categories && Array.isArray(categories) && (categories.indexOf(category) >= 0)) {
      // We are supposed to have a color for this.
      // console.log('No color is known for: ', category);
    }

    return color;
  };
}
