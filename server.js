const express = require("express");
const { connectToMongoDB, disconnectFromMongoDB } = require("./src/mongodb");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json()); // Para que Express pueda interpretar JSON en los requests

// Middleware
app.use((req, res, next) => {
    res.header("content-type", "application/json; charset=utf-8");
    next();
});

// Ruta principal
app.get('/', (req, res) => {
    res.status(200).send("🛒🛍️ Bienvenido a la API de Supermercado 🛍️🛒");
});

app.get("/productos", async (req, res) => {
    try {
        const client = await connectToMongoDB(); // Nos conectamos a MongoDB
        if (!client) {
            return res.status(500).json({ error: "Error al conectarse a MongoDB" }); // Si no se pudo conectar, respondemos con un error 500
        }

        const db = client.db("supermercado");
        const producto = await db.collection("supermercado").find().toArray();

        res.status(200).json(producto);
    } catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).json({ error: "Ocurrio un error interno en el servidor"});
    } finally {
        await disconnectFromMongoDB(); // Nos desconectamos de MongoDB
    }
});

// Ruta que devuelve un producto por su código
app.get("/productos/codigo/:codigo", async (req, res) => {
    const codigo = parseInt(req.params.codigo);
    if (isNaN(codigo)) {
        return res.status(400).json({ error: "El código debe ser un número válido" });
    }

    try{
        const client = await connectToMongoDB(); //Espera conectarse con MongoDB
        if (!client) {
           return res.status(500).json({ error: "Error al conectarse a MongoDB" });
        }

        const db = client.db("supermercado"); // Nombre de la base de datos
        const cod_producto = await db.collection("supermercado").findOne({codigo: codigo});  // Nombre de la colección
        
        if (!cod_producto) {
           return res.status(404).json({ message: "Producto no encontrado" });
        }

        res.status(200).json(cod_producto);
    } catch (error) {
        console.error("Error al buscar producto por codigo:", error);
        res.status(500).json({ error: "Ocurrio un error interno en el servidor"})
    } finally {
        await disconnectFromMongoDB();
    }  
});

app.get("/productos/categoria/:categoria", async (req, res) => {
    
    try{
        const client = await connectToMongoDB();
        if (!client) {
            return res.status(500).json({ error: "Error al conectarse a MongoDB" });
        }
        
        const db = client.db("supermercado");

        const categoria = req.params.categoria;

        // Se crea una constante regexExacta para buscar coincidencias exactas, sin distinguir mayusculas/minusculas
        const regexExacta = new RegExp(`^${categoria}$`, "i");

        // Se buscan productos cuyo nombre coincidan con la constante regexExacta 
        const cat_producto = await db.collection("supermercado").find({ categoria: { $regex: regexExacta } }).toArray();
        
        if (cat_producto.length === 0) {
         return res.status(404).json({ message: "No se encontraron categorias con ese nombre." });
        }

        res.status(200).json(cat_producto);
    } catch (error) {
        console.error("Error al buscar producto por categoria:", error); // Si ocurre un error inesperado lo muestra en consola y responde con 500
        res.status(500).json({ error: "Ocurrio un error interno en el servidor"})
    } finally {
        // Se desconecta de la base de datos
        await disconnectFromMongoDB();
    }
});

// Ruta para crear nuevo producto
app.post("/productos", async (req, res) => {
    const nuevoProducto = req.body; // Obtenemos los datos del cuerpo de la solicitud
    if (!nuevoProducto || Object.keys(nuevoProducto).length === 0){
       return res.status(400).json({ error: "El formato de datos recibidos esta vacio"}); // Si no hay datos, respondemos con un error 400 
    }
    
    if (!nuevoProducto.nombre || !nuevoProducto.nombre.trim() || typeof nuevoProducto.precio !== "number" || isNaN(nuevoProducto.precio) || !nuevoProducto.categoria || !nuevoProducto.categoria.trim()) {
       return res.status(400).json({ error: "Se necesitan los campos nombre, precio y categoria"});
    }

    try{
        client = await connectToMongoDB();
        if (!client) {
          return res.status(500).json({ error: "Error al conectarse a MongoDB" });
        }

        // Seleccionamos la coleccion supermercado y la guardamos en la constante inventario
        const inventario = client.db("supermercado").collection("supermercado");
        
        // Verificamos si ya existe un  producto con el mismo nombre sin distinguir mayusculas/minusculas
        const productoExistente = await inventario.findOne({
            nombre: { $regex: `^${nuevoProducto.nombre}$`, $options: "i"}
        });

        if (productoExistente) {
            return res.status(409).json({ mensaje: "El producto ya existe" });
        }

        // Función para generar un código único
        async function generarCodigoUnico() {
            let codigo;
            let existe = true;

            while (existe) {
                codigo = Math.floor(Math.random() * 10000);
                const codigoExistente = await inventario.findOne({ codigo });
                if (!codigoExistente) {
                    existe = false;
                }
            }

            return codigo;
        }

        // Generar el código único
        nuevoProducto.codigo = await generarCodigoUnico();

        await inventario.insertOne(nuevoProducto); // Se inserta el nuevo producto en el inventario

        console.log("Nuevo producto creado:", nuevoProducto); // Se muestra en la consola que se creo el producto

        res.status(201).json(nuevoProducto);
    } catch (error) {
        console.error("Error al insertar el nuevo producto:", error);
        res.status(500).json({ error: "Ocurrio un error interno en el servidor"})
    } finally {
        await disconnectFromMongoDB();
    }
});

//PUT. Actualiza un producto según su código
app.put("/productos/codigo/:codigo", async (req, res) => {
    const codigo = parseInt(req.params.codigo); // Extrae el código del producto desde la URL y lo convierte en número
    
    if (isNaN(codigo)) {
        return res.status(400).json({ error: "El código debe ser un número válido" });
    }
    
    const nuevosDatos = req.body; // Extrae los nuevos datos del cuerpo del request (lo que se quiere modificar)
    delete nuevosDatos._id; // Elimina el _id que antepone MongoDB así no da error porque ese id no se puede modificar

    // Valida que se haya enviado información en el cuerpo de la petición
    if (!nuevosDatos || Object.keys(nuevosDatos).length === 0){
       return res.status(400).send("Error en el formato de datos recibidos.");
    }

    const client = await connectToMongoDB (); // Se conecta a la base de datos MongoDB
    if (!client){
       return res.status(500).send("Error al conectarse a MongoDB.");
    }

    const inventario = client.db("supermercado").collection("supermercado"); 
     
    try {
    
        // Verifica si el código del producto existe
        const productoExistente = await inventario.findOne({ codigo });
        if (!productoExistente) {
            await disconnectFromMongoDB(); // Cierra la conexión si no existe
            return res.status(404).send("Producto no encontrado.");
        }

        // Si el código del producto existe, lo actualiza
        await inventario.updateOne({ codigo }, { $set: nuevosDatos }) // Busca el producto por su código y actualiza solo los campos que se envían
                //$set es un operador de actualización utilizado en MongoDB para ectualizar un campo específico en un documento existente. 
                // updateOne() permite actualizar uno o varios campos de un documento sin tener que reemplzarlo todo.
        console.log("Producto modificado:", nuevosDatos); // Muestra en consola lo actualizado
        res.status(200).send(nuevosDatos); // Responde al cliente
        
    } catch (error) {
        console.error("Error al modificar el producto:", error);
        res.status(500).json({ error: "Ocurrio un error interno en el servidor" }); // Si ocurrió algún error, lo muestra y responde con 500
    } finally {

        await disconnectFromMongoDB(); // Cierra la conexión a MongoDB
        
    }
});

// Eliminar un producto a partir del DELETE 
app.delete("/productos/codigo/:codigo", async(req, res)=>{
    const codigo = parseInt(req.params.codigo);
    if (isNaN(codigo)) {
        return res.status(400).json ({error: "El código debe ser un número válido"})
    }
    const client = await connectToMongoDB();
    if (!client){
        return res.status(500).json ({error:"error al conectarse a MongoDB"});
    }
    const inventario = client.db("supermercado").collection("supermercado");
    
    try{
        const resultado = await inventario.deleteOne({codigo});
        if (resultado.deletedCount === 0){
            return res.status(404).json({mensaje: "Producto no encontrado"});
        }
        console.log(`Producto con codigo ${codigo} eliminado`);
        res.status(200).json({mensaje:"Producto eliminado correctamente"});
    } catch(error) {
        console.error("Error al eliminar el producto:", error);
        res.status(500).json({error: "Ocurrió un error interno en el servidor"});
    } finally {
        await disconnectFromMongoDB();
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en ${PORT}`);
});