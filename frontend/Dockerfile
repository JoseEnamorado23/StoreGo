FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY next.config.mjs next-env.d.ts postcss.config.mjs tailwind.config.ts tsconfig.json ./

EXPOSE 3000
CMD ["npm", "run", "dev"]
