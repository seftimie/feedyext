# Feedy EXT - Brand Sentiment Analysis
Google Chrome Built-in AI Challenge
 
## [Team]() 
- [Silviu Daniel Eftimie](https://www.linkedin.com/in/eftimiesilviudaniel/)
- [Nicoleta Radulescu](https://www.linkedin.com/in/cornelia-nicoleta-radulescu-6b3b7b16a/)
- [Christian Stoyanov](https://www.linkedin.com/in/christian-stoyanov/)
- [Helena Rodríguez Cagide](www.linkedin.com/in/helena-rodriguez-cagide)



## Slides: [presentation](https://docs.google.com/presentation/d/1FMSB0SC8emAEIaiQybZuFdGAlA1DWjexGg-lQh_6zu4/edit?usp=sharing)
 
## Pillars:

### 1. Problem Statement  
Today, brands face a big challenge on social media. Community managers typically work only during office hours, while users are most active late at night and on weekends. This mismatch means negative comments can go unaddressed, which can damage a brand's image.  

**Feedy EXT** solves this problem: it’s a Chrome extension that monitors and responds to user comments across multiple platforms and languages, ensuring that no interactions are missed, no matter the time. With **Feedy EXT**, brands can better manage their image and understand customer feedback.  

---  

### 2. Overview, Target Audience, and Value  

**Feedy EXT** is designed for social media and PR teams, as well as brands aiming to optimize their digital platform management. The extension centralizes comments from platforms such as LinkedIn, Google My Business, TikTok, Twitter, Facebook, and Instagram into one tool.  

Additionally, it includes a centralized dashboard that provides valuable insights into social media conversations related to the brand. This enables brands to:  
- **Quickly respond to negative comments**, even outside business hours.  
- **Automate actions** like liking positive or neutral comments.  
- **Gain insights into customer sentiment**, helping improve products and services.  

### Target Audience:  
- **Social media and PR teams:** Simplifies user management and response.  
- **Brands:** Enhances audience connection by offering a unified and automated view of feedback across all platforms.  

---  

### 3. Core Functionalities, APIs, and GCP Serverless Products  

**Feedy EXT** leverages advanced technologies to deliver a robust and scalable experience:  

### Core Functionalities:  
1. **Sentiment Analysis:** Classifies comments as positive, negative, or neutral.  
2. **Automated Actions:**  
   - Automatically likes positive and neutral comments.  
   - Suggests responses for negative comments.  
3. **Centralized Dashboard:**  
   - Visualizes data in Looker Studio with customizable filters and charts.  
4. **Multi-platform Compatibility:** Manage multiple social media accounts from one place.  

### APIs and Tools Used:  
- **Chrome Prompt API:** For real-time analysis and classification of comments.  
- **Vertex AI:** Advanced data processing when the device doesn’t support Chrome’s capabilities.  
- **Google BigQuery:** Secure and scalable data storage.  
- **Looker Studio:** Visualization of insights with customizable charts and trends.  
- **Google Cloud Run:** Serverless and scalable services for reliable performance.  

**Feedy EXT** is designed to scale effortlessly, ensuring that brands can manage multiple accounts and platforms without complications.  

---  

### Try Feedy EXT!  
Discover how this tool can transform the way your brand manages social media, ensuring a strong connection with your audience 24/7. 🚀  


5. Feedy EXT in Action:
  - necesitan un gcp proyect; (habilitar las apis de cloud run, cloud build, bigquery);
  - setup env params: "GCP_PROJECT_ID" "BIGQUERY_DATASET_ID" "BIGQUERY_TABLE_ID";
  - utiliza "GCP Cloud Shell" y haz un git clone del repo en gcp; (https://github.com/seftimie/feedyext)
  - cd feedyext/ ejecutar bash setup.sh 
  - Install extension;
  - ir a linkedin, abrir un post y darle al analyze; actions;
