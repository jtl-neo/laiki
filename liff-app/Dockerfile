FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_BASE
ARG VITE_LIFF_ID
ARG VITE_LIFF_ID_APIKEY
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_LIFF_ID=$VITE_LIFF_ID
ENV VITE_LIFF_ID_APIKEY=$VITE_LIFF_ID_APIKEY
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
