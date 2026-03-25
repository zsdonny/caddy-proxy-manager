import { setProjectAnnotations } from 'storybook';
import * as previewAnnotations from './preview';

const project = setProjectAnnotations([previewAnnotations]);

// Run Storybook's `beforeAll` hook (e.g. loading global styles, themes)
beforeAll(project.beforeAll);
