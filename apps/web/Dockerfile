FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @api-sentinel/web
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/apps/web/.next ./.next
EXPOSE 3000
CMD ["npm", "run", "start"]
