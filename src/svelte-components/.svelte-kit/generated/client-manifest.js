export { matchers } from './client-matchers.js';

			export const nodes = [];

			export const server_loads = [];

			export const dictionary = {
	
};

			export const hooks = {
				handleError: (({ error }) => { console.error(error); return { message: 'Internal Error' }; }),
			};