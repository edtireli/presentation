# Anatomical models and visual sources

Sources identified in the shipped data and generation scripts. Dot-cloud and wireframe appearance, animation and lighting are presentation rendering choices.

| Asset | Origin | Processing and limits |
| --- | --- | --- |
| Rotating brain: `brain.json`, `brain-mesh.json` | FreeSurfer **fsaverage**, `subjects/fsaverage/mri/aseg.mgz`; Fischl, 2012 | Tissue masks converted to surfaces and points. Atlas anatomy, not an individual participant. |
| Large arteries and venous sinuses: `brainproject-vessels.json` | Itay Inbar's **Brain Project**, derived from **Z-Anatomy / BodyParts3D** | Simplified tubes, with flagged synthetic bridges and internal-jugular continuations. The animated bolus is schematic, not measured tracer motion in these atlas vessels. |
| Cortex slab and registered cell meshes: `h01-cortex-slab.json` | **H01 human temporal cortex**, Google Research and Lichtman Lab, Harvard; Shapson-Coe et al., Science 2024 | Sampled points and reduced meshes. H01 does not intrinsically label arterial/venous identity. Combined MG_OPC and vascular-associated labels retain their limitations. |
| Additional cells: `nvu-morphologies.json` | **NeuroMorpho.Org** | Individual reconstruction records are in the data. These illustrative cells are not all from one tissue specimen. |
| Neurovascular-unit points: `nizari2019-nvu-points.json` | **Nizari et al., 2019**, Frontiers in Aging Neuroscience 11:172, Figure 2B | Figure-derived visualisation, distinct from H01 and the gross anatomy atlas. |
| Participant parcel brain: `patient-parcels.json`, `patient-parcel-surface.json` | Local **FastSurfer DKT segmentation and p-Brain derivatives** | Participant-derived outputs already in the published defence. Not an online stock model. No raw MRI data is added here. |
| Thumb and pulse oximeter | **Procedural JavaScript model created for this presentation**, `extensions/pulse-oximeter.js` | Parametric thumb, nail and sensor. Not a downloaded mesh, participant scan or faithful replica of the study's MRI-compatible sensor. |

## Links and recorded terms

- [FreeSurfer fsaverage](https://surfer.nmr.mgh.harvard.edu/fswiki/FsAverage), [licence information](https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense), [Fischl 2012](https://doi.org/10.1016/j.neuroimage.2012.01.021). Retain the citation and check applicable distribution terms before redistributing derived anatomy.
- [Brain Project](https://github.com/itayinbarr/brainproject). The vessel JSON records **CC BY-SA 4.0**, © Z-Anatomy contributors, curated by Itay Inbar. Upstream distinguishes code from asset licensing. Retain attribution, licence and modification descriptions.
- [H01 release](https://h01-release.storage.googleapis.com/data.html), [Shapson-Coe et al. 2024](https://doi.org/10.1126/science.adk4858). The bundled asset records **CC BY 4.0**. Retain the dataset and paper credits.
- [NeuroMorpho.Org](https://neuromorpho.org). The export records **CC BY 4.0**; retain individual reconstruction metadata.
- [Nizari et al. 2019](https://doi.org/10.3389/fnagi.2019.00172). The figure-derived export records **CC BY 4.0**.

Software licensing does not replace asset-specific terms. Participant outputs, recordings and paper figures are not offered as stock assets. Figures and movies elsewhere retain citations in the bibliography and speaker-cue sources.
