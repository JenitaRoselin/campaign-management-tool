import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

class CustomerSegmentationAI:
    def __init__(self, n_clusters=4):
        # We will use this as the MAX possible clusters
        self.max_clusters = n_clusters
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=2)
        self.features = ['recency', 'frequency', 'monetary', 'discount_given']

    def process_dataframe(self, df: pd.DataFrame):
        # 1. Basic Cleaning
        df['send_timestamp'] = pd.to_datetime(df['send_timestamp'])
       
        # 2. RFM Aggregation
        rfm = df.groupby('customer_id').agg(
            recency=('send_timestamp', lambda x: (df['send_timestamp'].max() - x.max()).days),
            frequency=('customer_id', 'count'),
            monetary=('item_price', 'sum'),
            discount_given=('discount_given', 'mean')
        ).reset_index()

        # Handle missing data
        rfm[self.features] = rfm[self.features].fillna(0)

        # 3. Feature Scaling
        X = rfm[self.features]
        X_scaled = self.scaler.fit_transform(X)

        # --- DYNAMIC K-MEANS WITH SILHOUETTE SCORING ---
        max_k = min(self.max_clusters, len(rfm))
        best_k = 1 if len(rfm) < 2 else 2
        best_score = -1.0

        if len(rfm) >= 3:
            # silhouette_score requires: 2 <= n_labels <= n_samples - 1
            max_silhouette_k = min(max_k, len(rfm) - 1)
            for k in range(2, max_silhouette_k + 1):
                try:
                    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                    labels = kmeans.fit_predict(X_scaled)
                    unique_labels = np.unique(labels)

                    if len(unique_labels) < 2 or len(unique_labels) >= len(rfm):
                        continue

                    score = silhouette_score(X_scaled, labels)

                    if score > best_score:
                        best_score = score
                        best_k = k
                except Exception:
                    continue
        elif len(rfm) == 2:
            best_k = 2
        else:
            best_k = 1

        # Apply the mathematically optimal K
        self.kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
        rfm['cluster'] = self.kmeans.fit_predict(X_scaled)

        # 5. PCA for Frontend Visualization
        if len(rfm) >= 2:
            X_pca = self.pca.fit_transform(X_scaled)
            rfm['pc1'] = np.round(X_pca[:, 0], 4)
            rfm['pc2'] = np.round(X_pca[:, 1], 4)
        else:
            rfm['pc1'] = 0.0
            rfm['pc2'] = 0.0

        numeric_columns = ['recency', 'frequency', 'monetary', 'discount_given', 'pc1', 'pc2']
        for column in numeric_columns:
            rfm[column] = pd.to_numeric(rfm[column], errors='coerce')
        rfm[numeric_columns] = rfm[numeric_columns].replace([np.inf, -np.inf], 0).fillna(0)
        rfm['monetary'] = np.round(rfm['monetary'], 2)

        # --- FULLY DYNAMIC NAMING ---
        # Names them Tier 1, Tier 2, etc. based on their spending power
        cluster_centers = rfm.groupby('cluster')['monetary'].mean()
        sorted_clusters = cluster_centers.sort_values(ascending=False).index
       
        naming_map = {}
        for i, cluster_id in enumerate(sorted_clusters):
            if i == 0:
                naming_map[cluster_id] = "Tier 1: High Value"
            elif i == len(sorted_clusters) - 1 and len(sorted_clusters) > 1:
                naming_map[cluster_id] = f"Tier {i+1}: Low Value"
            else:
                naming_map[cluster_id] = f"Tier {i+1}: Mid Value"
               
        rfm['segment_name'] = rfm['cluster'].map(naming_map)

        return rfm

    def get_segment_stats(self, rfm_df):
        """Returns summary stats formatted for frontend cards."""
        stats = rfm_df.groupby('segment_name').agg({
            'customer_id': 'count',
            'monetary': 'mean',
            'recency': 'mean'
        }).rename(columns={'customer_id': 'count'})
       
        return stats.round(2).to_dict(orient='index')

if __name__ == "__main__":
    print("AI Class Loaded Successfully with Dynamic Silhouette Scoring.")