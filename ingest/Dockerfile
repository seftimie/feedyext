# Usar una imagen base de Node.js oficial
FROM node:18-slim

# Establecer el directorio de trabajo en la aplicación
WORKDIR /app

# Copiar los archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el resto del código fuente
COPY . .

# Exponer el puerto definido en .env (8080)
EXPOSE 8080

# Definir variables de entorno necesarias
ENV PORT=8080

# Comando para ejecutar la aplicación
CMD [ "npm", "start" ] 