# Use the official MongoDB image as the base image
FROM mongo:latest

# Expose the default MongoDB port
EXPOSE 27017

# Set the default command to run when the container starts
CMD ["mongod", "--replSet", "rs0", "--bind_ip_all", "--port", "27017"]
